// ── CONFIG ──
var ADMIN_PASSWORD = 'ohshit123';

// ── LOADING MESSAGES ──
var LOADING_MSGS = [
    "Don't panic, I got u babe... 💩",
    "Sniffing out the nearest throne... 🐽",
    "Nature called, we answered... 📞",
    "Calculating your emergency route... 🚨",
    "Locating the porcelain gods... 🙏",
    "Finding your closest relief zone... 😅",
    "Scanning for available stalls... 🔍",
    "Loading faster than you can say Oh Sh*t... 💩",
    "Hold it in just a little longer... 😬",
    "Almost there... we promise... 🤞",
];

// ── STATE ──
var map, userMarker, routeLine, clusterGroup;
var userLat = null, userLon = null;
var gender = 'male';
var allMarkers = [];
var currentRatingId = null;
var manualStarRating = null;
var BATHROOMS = [];
var pendingNavTarget = null;
var travelMode = 'walk';
var appStarted = false;
var loadingInterval = null;
var currentToiletId = null;

var TRAVEL_SPEEDS  = { walk:5, bike:15, drive:50 };
var TRAVEL_ICONS   = { walk:'🚶', bike:'🚴', drive:'🚗' };
var ORS_PROFILES   = { walk:'foot-walking', bike:'cycling-regular', drive:'driving-car' };

// ── THEME ──
function getTheme() {
    var h = new Date().getHours();
    return (h >= 6 && h < 20) ? 'day' : 'night';
}
function applyTheme() {
    document.body.classList.remove('day','night');
    document.body.classList.add(getTheme());
}

// ── LOADING SCREEN ──
function showLoading() {
    applyTheme();
    var screen = document.getElementById('loading-screen');
    screen.style.display = 'flex';
    var i = 0;
    document.getElementById('loading-msg').textContent = LOADING_MSGS[0];
    loadingInterval = setInterval(function() {
        i = (i + 1) % LOADING_MSGS.length;
        document.getElementById('loading-msg').textContent = LOADING_MSGS[i];
    }, 2000);
}

function hideLoading() {
    clearInterval(loadingInterval);
    var screen = document.getElementById('loading-screen');
    var op = 1;
    var fade = setInterval(function() {
        op -= 0.08;
        screen.style.opacity = op;
        if (op <= 0) {
            clearInterval(fade);
            screen.style.display = 'none';
            screen.style.opacity = '1';
        }
    }, 30);
}

// ── START APP ──
function startApp(g) {
    if (appStarted) return;
    gender = g;
    applyTheme();
    document.getElementById('signup').style.display = 'none';

    var existingName = localStorage.getItem('username');
    if (existingName) {
        launchMap();
    } else {
        showNicknameScreen();
    }
}

function showNicknameScreen() {
    var screen = document.getElementById('nickname-screen');
    screen.style.display = 'flex';
    setTimeout(function() {
        document.getElementById('nickname-input').focus();
    }, 100);
}

function saveNickname() {
    var name = document.getElementById('nickname-input').value.trim();
    if (!name) {
        document.getElementById('nickname-input').style.borderColor = '#ff4444';
        return;
    }
    localStorage.setItem('username', name);
    if (!localStorage.getItem('rolls')) localStorage.setItem('rolls', '0');
    document.getElementById('nickname-screen').style.display = 'none';
    launchMap();
}

function launchMap() {
    if (appStarted) return;
    appStarted = true;
    applyTheme();

    document.getElementById('map').style.display     = 'block';
    document.getElementById('hud').style.display     = 'flex';
    document.getElementById('add-btn').style.display = 'block';

    showLoading();

    var isNight = getTheme() === 'night';
    var tileUrl = isNight
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    map = L.map('map', { zoomControl:true }).setView([31.7, 35.0], 8);
    L.tileLayer(tileUrl, { attribution:'© OpenStreetMap contributors', maxZoom:19 }).addTo(map);

    clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 25,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        disableClusteringAtZoom: 16,
        iconCreateFunction: function(cluster) {
            return L.divIcon({
                html: '<div class="cluster-pin"><span>' + cluster.getChildCount() + '</span></div>',
                className: '', iconSize:[40,40]
            });
        }
    });
    map.addLayer(clusterGroup);

    clusterGroup.clearLayers();
    allMarkers = [];
    BATHROOMS  = [];

    getUserToilets().forEach(function(b) { addMarker(b); });
    fetchBathrooms();
    startGPS();
    setTimeout(function() { updateRollDisplay(false); }, 500);
}

// ── STATIC DATA LOADER ──
function fetchBathrooms() {
    setStatus('Loading bathrooms...', false);
    try { localStorage.removeItem('cached_bathrooms'); } catch(e) {}
    BATHROOMS = STATIC_BATHROOMS;
    BATHROOMS.forEach(function(b) { addMarker(b); });
    setStatus(BATHROOMS.length + ' toilets loaded', true);
    hideLoading();
    updateNearest();
}

// ── GPS ──
function startGPS() {
    if (!navigator.geolocation) { setStatus('GPS not supported', false); return; }
    navigator.geolocation.watchPosition(onPosition, onGPSError, {
        enableHighAccuracy:true, maximumAge:3000, timeout:15000
    });
}

function onPosition(pos) {
    userLat = pos.coords.latitude;
    userLon = pos.coords.longitude;
    var acc = Math.round(pos.coords.accuracy);
    setStatus('GPS locked ±' + acc + 'm', true);

    if (!userMarker) {
        var icon = L.icon({
            iconUrl: gender === 'male' ? 'male_marker.svg' : 'female_marker.svg',
            iconSize:[36,72], iconAnchor:[18,72], className:'user-marker-img'
        });
        userMarker = L.marker([userLat, userLon], { icon:icon, zIndexOffset:1000 }).addTo(map);
        map.setView([userLat, userLon], 16);
        applyMarkerFilter();
        document.getElementById('recenter-btn').style.display = 'block';
        document.getElementById('search-btn').style.display   = 'block';
    } else {
        userMarker.setLatLng([userLat, userLon]);
    }

    updateNearest();
    if (window._navigating) NavigatorAI.tick();
}

function applyMarkerFilter() {
    var el = document.getElementById('marker-filter-style');
    if (el) el.remove();
    var s = document.createElement('style');
    s.id = 'marker-filter-style';
    s.innerHTML = '.user-marker-img{filter:' + (getTheme()==='night' ? 'invert(1)' : 'invert(0)') + ';}';
    document.head.appendChild(s);
}

function onGPSError(err) {
    var m = {1:'GPS denied',2:'GPS unavailable',3:'GPS timeout'};
    setStatus(m[err.code] || 'GPS error', false);
}

function setStatus(txt, locked) {
    document.getElementById('gps-status').textContent = txt;
    var dot = document.getElementById('gps-dot');
    locked ? dot.classList.add('locked') : dot.classList.remove('locked');
}

// ── RECENTER ──
function recenterMap() {
    if (userLat !== null) map.setView([userLat, userLon], 16);
}

// ── SEARCH ──
function openSearch() {
    document.getElementById('search-bar').style.display = 'flex';
    setTimeout(function(){ document.getElementById('search-input').focus(); }, 100);
}
function closeSearch() {
    document.getElementById('search-bar').style.display = 'none';
    document.getElementById('search-input').value = '';
}
function doSearch() {
    var query = document.getElementById('search-input').value.trim();
    if (!query) return;
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&q=' + encodeURIComponent(query))
        .then(function(r) { return r.json(); })
        .then(function(results) {
            if (!results || !results.length) { alert('Location not found.'); return; }
            map.setView([parseFloat(results[0].lat), parseFloat(results[0].lon)], 15);
            closeSearch();
        })
        .catch(function() { alert('Search failed.'); });
}
document.addEventListener('DOMContentLoaded', function() {
    var input = document.getElementById('search-input');
    if (input) input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSearch(); });
    var ni = document.getElementById('nickname-input');
    if (ni) ni.addEventListener('keydown', function(e) { if (e.key === 'Enter') saveNickname(); });
});

// ── NEAREST ──
function updateNearest() {
    if (userLat === null) return;
    var all = getAllBathrooms();
    if (!all.length) return;

    var best = null, bestDist = Infinity;
    all.forEach(function(b) {
        var d = haversine(userLat, userLon, b.lat, b.lon);
        if (d < bestDist) { bestDist = d; best = b; }
    });
    if (!best) return;

    document.getElementById('nb-name').textContent = best.name;
    document.getElementById('nb-dist').textContent = fmtDist(bestDist);
    window._nearest = best;

    if (!window._navigating) {
        document.getElementById('nearest-bar').style.display = 'flex';
    }

    allMarkers.forEach(function(m) {
        var el = m.marker.getElement();
        if (!el) return;
        var pin = el.querySelector('.map-pin');
        if (!pin) return;
        if (m.data.id === best.id) pin.classList.add('nearest-pin');
        else pin.classList.remove('nearest-pin');
    });
}

// ── TRAVEL MODAL ──
function openTravelModal() {
    pendingNavTarget = window._nearest;
    if (!pendingNavTarget) return;
    document.querySelectorAll('.travel-btn').forEach(function(b){ b.classList.remove('selected'); });
    document.getElementById('travel-modal').style.display = 'flex';
}
function closeTravelModal() {
    document.getElementById('travel-modal').style.display = 'none';
    pendingNavTarget = null;
}
function startNavWithMode(mode) {
    travelMode = mode;
    document.getElementById('travel-modal').style.display = 'none';
    if (pendingNavTarget) { navigateTo(pendingNavTarget); pendingNavTarget = null; }
}

// ── NAVIGATE ──
function navigateToNearest() {
    if (window._nearest) openTravelModal();
}
function navigateTo(b) {
    if (userLat === null) { alert('GPS not ready yet'); return; }
    window._navTarget  = b;
    window._navigating = true;
    document.getElementById('nearest-bar').style.display = 'none';
    NavigatorAI.start(b, travelMode);
}
function stopNavigation() {
    window._navigating = false;
    window._navTarget  = null;
    NavigatorAI.stop();
    document.getElementById('nearest-bar').style.display = 'flex';
}

// ── GOLD RING CHECK ──
function isGoldRing(b) {
    if (!b.user_added) return false;
    return (Date.now() - (b.created_at || 0)) < 86400000;
}

// ── ADD MARKER ──
function addMarker(b) {
    var scores    = getScores();
    var userName  = localStorage.getItem('username') || 'anonymous';
    var locScores = scores[b.id] || {};
    var myScore   = locScores[userName] || 0;
    var vals      = Object.values(locScores);
    var topScore  = vals.length ? Math.max.apply(null, vals) : 0;
    var hasCrown  = myScore > 0 && myScore >= topScore;

    var pinClass  = 'map-pin' + (isGoldRing(b) ? ' gold-ring' : '');
    var crownHtml = hasCrown ? '<span class="crown">👑</span>' : '';
    var html      = '<div class="' + pinClass + '">' + crownHtml + '🚽</div>';

    var icon = L.divIcon({ className:'', html:html, iconSize:[32,32], iconAnchor:[16,32] });
    var marker = L.marker([b.lat, b.lon], { icon:icon });
    marker._toiletId = b.id;
    marker.on('click', function() { showToiletPopup(marker, b); });
    clusterGroup.addLayer(marker);
    allMarkers.push({ marker:marker, data:b });
}

// ── POPUP — with category badge + bathroom note ──
function showToiletPopup(marker, b) {
    var dist      = userLat !== null ? haversine(userLat, userLon, b.lat, b.lon) : null;
    var distText  = dist !== null ? fmtDist(dist) : '—';
    var ratingData = getRatings()[b.id];
    var stars     = ratingData ? starsFromScore(ratingData.score) : '⬜⬜⬜⬜⬜';
    var userName  = localStorage.getItem('username') || 'anonymous';
    var canDelete = b.user_added && b.created_by === userName;
    var delBtn    = canDelete
        ? '<button class="popup-delete" onclick="deleteToilet(\'' + b.id + '\')">🗑️ Delete</button>'
        : '';
    var scores    = getScores();
    var locScores = scores[b.id] || {};
    var myScore   = locScores[userName] || 0;
    var vals      = Object.values(locScores);
    var topScore  = vals.length ? Math.max.apply(null, vals) : 0;
    var hasCrown  = myScore > 0 && myScore >= topScore;

    // Category badge
    var CATEGORY_LABELS = {
        'public_toilet':   '🚽 Public Toilet',
        'gas_station':     '⛽ Gas Station',
        'food_chain':      '🍔 Food Chain',
        'food_venue':      '🍽️ Restaurant',
        'hotel':           '🏨 Hotel',
        'hospital':        '🏥 Hospital',
        'beach':           '🏖️ Beach',
        'mall':            '🏬 Mall',
        'bus_station':     '🚌 Bus Station',
        'train_station':   '🚆 Train Station',
        'public_building': '🏛️ Public Building',
        'university':      '🎓 University',
    };
    var CATEGORY_COLORS = {
        'public_toilet':   '#27AE60',
        'gas_station':     '#F39C12',
        'food_chain':      '#E74C3C',
        'food_venue':      '#E67E22',
        'hotel':           '#8E44AD',
        'hospital':        '#C0392B',
        'beach':           '#2980B9',
        'mall':            '#1ABC9C',
        'bus_station':     '#D35400',
        'train_station':   '#6C3483',
        'public_building': '#7F8C8D',
        'university':      '#2471A3',
    };
    var cat      = b.category || (b.user_added ? 'user_added' : 'public_toilet');
    var catLabel = b.user_added ? '📍 Added by user' : (CATEGORY_LABELS[cat] || '🚽 Bathroom');
    var catColor = b.user_added ? '#555' : (CATEGORY_COLORS[cat] || '#27AE60');
    var badgeHtml = '<div class="popup-badge" style="background:' + catColor + '">' + catLabel + '</div>';

    // Bathroom note (food venues may require purchase)
    var noteHtml = '';
    if (b.bathroom_note) {
        noteHtml = '<div class="popup-note">⚠️ ' + b.bathroom_note + '</div>';
    }

    // 50m unlock check
    var isNear    = dist !== null && dist <= 50;
    var gamesBtn  = isNear
        ? '<button class="popup-games unlocked" onclick="openGameSelect(\'' + b.id + '\')">🕹️ Bathroom Games</button>'
        : '<button class="popup-games locked">🔒 Bathroom Games (get within 50m)</button>';

    L.popup({ maxWidth:260 })
        .setLatLng(marker.getLatLng())
        .setContent(
            '<div class="popup-inner">' +
            '<div class="popup-name">' + (hasCrown ? '👑 ' : '') + b.name + '</div>' +
            badgeHtml +
            noteHtml +
            '<div class="popup-stars">' + stars + '</div>' +
            '<div class="popup-dist">' + distText + '</div>' +
            '<button class="popup-go" onclick="navigateFromPopup(\'' + b.id + '\')">▶ Navigate</button>' +
            '<button class="popup-rate" onclick="openRatingModal(\'' + b.id + '\')">⭐ Rate</button>' +
            '<button class="popup-share" onclick="shareToilet(\'' + b.id + '\',\'' + b.name + '\',' + b.lat + ',' + b.lon + ')">📤 Share</button>' +
            gamesBtn +
            delBtn +
            '</div>'
        )
        .openOn(map);
}

function navigateFromPopup(id) {
    map.closePopup();
    var b = getAllBathrooms().find(function(x){ return String(x.id) === String(id); });
    if (b) { window._nearest = b; openTravelModal(); }
}

// ── GAMES ──
function openGameSelect(toiletId) {
    currentToiletId = toiletId;
    map.closePopup();

    // Update best scores on cards
    var games = ['pacman','snake','tetris','mario'];
    var userName = localStorage.getItem('username') || 'anonymous';
    var allScores = getGameScores();
    var total = 0;

    games.forEach(function(g) {
        var best = (allScores[g] && allScores[g][userName]) ? allScores[g][userName] : 0;
        var el = document.getElementById('best-' + g);
        if (el) el.textContent = best;
        total += best;
    });

    document.getElementById('total-score').textContent = total;
    document.getElementById('game-select').style.display = 'flex';
}

function closeGameSelect() {
    document.getElementById('game-select').style.display = 'none';
    currentToiletId = null;
}

function launchGame(gameType) {
    document.getElementById('game-select').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';

    var canvas = document.getElementById('game-canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.getBoundingClientRect();

    document.getElementById('gb-level').textContent = 'LVL 1';
    document.getElementById('gb-score').textContent = '🧻 0';

    // Launch selected game
    if (gameType === 'pacman')  startPacman(canvas, currentToiletId);
    if (gameType === 'snake')   startSnake(canvas, currentToiletId);
    if (gameType === 'tetris')  startTetris(canvas, currentToiletId);
    if (gameType === 'mario')   startMario(canvas, currentToiletId);
}

function exitGame() {
    stopCurrentGame();
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('game-select').style.display = 'flex';
}

// Called by each game to update HUD
function updateGameHUD(level, score) {
    document.getElementById('gb-level').textContent = 'LVL ' + level;
    document.getElementById('gb-score').textContent = '🧻 ' + score;
}

// Called by each game when level completed
function onLevelComplete(gameType, level, score) {
    var userName = localStorage.getItem('username') || 'anonymous';
    var allScores = getGameScores();
    if (!allScores[gameType]) allScores[gameType] = {};
    var prev = allScores[gameType][userName] || 0;
    if (score > prev) allScores[gameType][userName] = score;
    localStorage.setItem('arcade_scores', JSON.stringify(allScores));

    // Award rolls based on level completed
    // Base: 10 rolls per level + bonus for score
    var rollsEarned = 10 * level + Math.floor(score / 50);
    addRolls(rollsEarned);

    // Flash the roll counter
    updateRollDisplay(true);

    // Also update map crown scores
    if (currentToiletId) {
        var mapScores = getScores();
        if (!mapScores[currentToiletId]) mapScores[currentToiletId] = {};
        mapScores[currentToiletId][userName] = (mapScores[currentToiletId][userName] || 0) + 100;
        localStorage.setItem('game_scores', JSON.stringify(mapScores));
        refreshMarker(currentToiletId);
    }
}

// ── ROLL ECONOMY ──
function getRolls() {
    return parseInt(localStorage.getItem('rolls') || '0', 10);
}

function addRolls(amount) {
    var current = getRolls();
    localStorage.setItem('rolls', String(current + amount));
    updateRollDisplay(false);
}

function spendRolls(amount) {
    var current = getRolls();
    if (current < amount) return false;
    localStorage.setItem('rolls', String(current - amount));
    updateRollDisplay(false);
    return true;
}

function updateRollDisplay(flash) {
    var el = document.getElementById('roll-counter');
    if (!el) return;
    var rolls = getRolls();
    el.textContent = rolls.toLocaleString();
    // Show the button
    var btn = document.getElementById('roll-btn');
    if (btn) btn.style.display = 'flex';
    if (flash) {
        var parent = el.closest('#roll-btn');
        if (parent) {
            parent.style.transform = 'scale(1.25)';
            parent.style.background = 'rgba(255,220,50,0.95)';
            setTimeout(function() {
                parent.style.transform = 'scale(1)';
                parent.style.background = 'rgba(255,255,255,0.92)';
            }, 600);
        }
    }
}

// ── STORE ──
function openStore() {
    var el = document.getElementById('store-roll-count');
    if (el) el.textContent = getRolls().toLocaleString();
    document.getElementById('store-modal').style.display = 'flex';
}
function closeStore() {
    document.getElementById('store-modal').style.display = 'none';
}

// ── NAME CHANGE ──
function openNameChange() {
    closeStore();
    document.getElementById('name-input').value = '';
    document.getElementById('name-error').textContent = '';
    document.getElementById('name-modal').style.display = 'flex';
}
function closeNameChange() {
    document.getElementById('name-modal').style.display = 'none';
}
function submitNameChange() {
    var newName = document.getElementById('name-input').value.trim();
    var errEl   = document.getElementById('name-error');
    if (!newName) { errEl.textContent = 'Enter a name!'; return; }
    if (getRolls() < 1500) {
        errEl.textContent = 'Not enough 🧻 rolls! Need 1500.';
        return;
    }
    spendRolls(1500);
    localStorage.setItem('username', newName);
    closeNameChange();
    updateRollDisplay(false);
    alert('Username changed to ' + newName + ' 🚽');
}

function getGameScores() {
    try { return JSON.parse(localStorage.getItem('arcade_scores') || '{}'); } catch(e) { return {}; }
}

// Input handler — called by Game Boy buttons
function gameInput(dir) {
    window._gameInput = dir;
    window.dispatchEvent(new CustomEvent('gbinput', { detail:dir }));
}
function gameInputEnd(dir) {
    window._gameInputEnd = dir;
    window.dispatchEvent(new CustomEvent('gbinputend', { detail:dir }));
}

// Stop whatever game is running
function stopCurrentGame() {
    window.dispatchEvent(new CustomEvent('gbinput', { detail:'stop' }));
    if (window._gameLoop) { clearInterval(window._gameLoop); window._gameLoop = null; }
    if (window._gameLoopRaf) { cancelAnimationFrame(window._gameLoopRaf); window._gameLoopRaf = null; }
}

// Keyboard support
document.addEventListener('keydown', function(e) {
    var KEY_MAP = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', ' ':'a', Enter:'start', z:'b', x:'a' };
    if (KEY_MAP[e.key]) { e.preventDefault(); gameInput(KEY_MAP[e.key]); }
});

// ── SHARE ──
function shareToilet(id, name, lat, lon) {
    var url  = 'https://maps.google.com/?q=' + lat + ',' + lon;
    var text = '🚽 Found a toilet at ' + name + '! ' + url;
    if (navigator.share) {
        navigator.share({ title:'Oh Sh*t 💩', text:text, url:url });
    } else {
        try { navigator.clipboard.writeText(text); alert('Copied! 📋'); }
        catch(e) { alert(text); }
    }
}

// ── DELETE ──
function deleteToilet(id) {
    var userName = localStorage.getItem('username') || 'anonymous';
    var saved    = getUserToilets();
    var toilet   = saved.find(function(b){ return String(b.id) === String(id); });
    if (!toilet) return;
    if (toilet.created_by !== userName) {
        var pass = prompt('Enter admin password:');
        if (pass !== ADMIN_PASSWORD) { alert('Wrong password.'); return; }
    }
    if (!confirm('Delete "' + toilet.name + '"?')) return;
    localStorage.setItem('user_toilets', JSON.stringify(
        saved.filter(function(b){ return String(b.id) !== String(id); })
    ));
    for (var i = 0; i < allMarkers.length; i++) {
        if (String(allMarkers[i].data.id) === String(id)) {
            clusterGroup.removeLayer(allMarkers[i].marker);
            allMarkers.splice(i, 1); break;
        }
    }
    map.closePopup();
    updateNearest();
}

// ── ADD TOILET — tap-to-place ──
var _addMode = false;
var _addPinMarker = null;
var _addPinLat = null;
var _addPinLon = null;

function openModal() {
    // Enter tap-to-place mode
    _addMode = true;
    _addPinLat = null;
    _addPinLon = null;
    if (_addPinMarker) { map.removeLayer(_addPinMarker); _addPinMarker = null; }

    document.getElementById('add-overlay').style.display = 'flex';
    document.getElementById('add-modal').style.display = 'none';
    document.getElementById('toilet-name').value = '';

    map.getContainer().style.cursor = 'crosshair';
    map.once('click', function(e) {
        _onAddMapClick(e.latlng.lat, e.latlng.lng);
    });
}

function _onAddMapClick(lat, lng) {
    _addPinLat = lat;
    _addPinLon = lng;

    // Drop a preview pin
    if (_addPinMarker) map.removeLayer(_addPinMarker);
    _addPinMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: '',
            html: '<div class="add-preview-pin">🚽</div>',
            iconSize: [36, 36],
            iconAnchor: [18, 36]
        })
    }).addTo(map);

    // Show name input modal
    document.getElementById('add-overlay').style.display = 'none';
    document.getElementById('add-modal').style.display = 'flex';
    map.getContainer().style.cursor = '';
    setTimeout(function(){ document.getElementById('toilet-name').focus(); }, 100);
}

function closeModal() {
    _addMode = false;
    _addPinLat = null;
    _addPinLon = null;
    if (_addPinMarker) { map.removeLayer(_addPinMarker); _addPinMarker = null; }
    document.getElementById('add-modal').style.display = 'none';
    document.getElementById('add-overlay').style.display = 'none';
    document.getElementById('toilet-name').value = '';
    map.getContainer().style.cursor = '';
    // Remove any pending one-time click listener
    map.off('click');
}

function saveToilet() {
    var name = document.getElementById('toilet-name').value.trim();
    if (!name) {
        document.getElementById('toilet-name').style.borderColor = '#ff4444';
        return;
    }
    var lat = _addPinLat !== null ? _addPinLat : map.getCenter().lat;
    var lon = _addPinLon !== null ? _addPinLon : map.getCenter().lng;
    var userName = localStorage.getItem('username') || 'anonymous';
    var b = {
        id: Date.now(), lat: lat, lon: lon,
        name: name, user_added: true,
        created_by: userName, created_at: Date.now()
    };
    // Remove preview pin — addMarker will place the real one
    if (_addPinMarker) { map.removeLayer(_addPinMarker); _addPinMarker = null; }
    addMarker(b);
    var saved = getUserToilets();
    saved.push(b);
    localStorage.setItem('user_toilets', JSON.stringify(saved));
    updateNearest();
    _addMode = false;
    _addPinLat = null;
    _addPinLon = null;
    closeModal();
}

// ── RATING ──
function openRatingModal(id) {
    currentRatingId  = id;
    manualStarRating = null;
    map.closePopup();
    document.querySelectorAll('.opt-btn').forEach(function(b){ b.classList.remove('selected'); });
    document.querySelectorAll('.star-pick').forEach(function(s){ s.classList.remove('active'); });
    updateStarPreview();
    document.getElementById('rating-modal').style.display = 'flex';
}
function closeRatingModal() {
    document.getElementById('rating-modal').style.display = 'none';
    currentRatingId  = null;
    manualStarRating = null;
}
function setManualStar(n) {
    manualStarRating = n;
    document.querySelectorAll('.star-pick').forEach(function(s, i){
        s.classList.toggle('active', i < n);
    });
    document.querySelectorAll('.opt-btn').forEach(function(b){ b.classList.remove('selected'); });
    updateStarPreview();
}
function toggleOpt(btn) {
    manualStarRating = null;
    document.querySelectorAll('.star-pick').forEach(function(s){ s.classList.remove('active'); });
    btn.classList.toggle('selected');
    updateStarPreview();
}
function updateStarPreview() {
    document.getElementById('star-preview').textContent = starsFromScore(calcScore());
}
function calcScore() {
    if (manualStarRating !== null) return manualStarRating;
    var total = 0, count = 0;
    document.querySelectorAll('.opt-btn.selected').forEach(function(b){
        total += parseInt(b.getAttribute('data-val')); count++;
    });
    if (!count) return 3;
    return Math.min(5, Math.max(1, Math.round(((total + 4) / 8) * 4) + 1));
}
function starsFromScore(score) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= Math.round(score) ? '⭐' : '⬜';
    return s;
}
function submitRating() {
    if (currentRatingId === null) return;
    var ratings = getRatings();
    ratings[currentRatingId] = { score:calcScore(), ts:Date.now() };
    localStorage.setItem('ratings', JSON.stringify(ratings));
    refreshMarker(currentRatingId);
    closeRatingModal();
}
function getRatings() {
    try { return JSON.parse(localStorage.getItem('ratings') || '{}'); } catch(e) { return {}; }
}
function refreshMarker(id) {
    for (var i = 0; i < allMarkers.length; i++) {
        if (String(allMarkers[i].data.id) === String(id)) {
            clusterGroup.removeLayer(allMarkers[i].marker);
            var d = allMarkers[i].data;
            allMarkers.splice(i, 1);
            addMarker(d); break;
        }
    }
    updateNearest();
}

// ── SCORES ──
function getScores() {
    try { return JSON.parse(localStorage.getItem('game_scores') || '{}'); } catch(e) { return {}; }
}

// ── ETA ──
function calcETA(distMeters, mode) {
    var speedKmh = TRAVEL_SPEEDS[mode] || 5;
    var mins     = Math.ceil((distMeters / (speedKmh * 1000 / 3600)) / 60);
    return mins < 1 ? '< 1 min' : mins + ' min';
}

// ── HELPERS ──
function getAllBathrooms() { return BATHROOMS.concat(getUserToilets()); }
function getUserToilets() {
    try { return JSON.parse(localStorage.getItem('user_toilets') || '[]'); } catch(e) { return []; }
}
function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
            Math.sin(dLon/2)*Math.sin(dLon/2);
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function fmtDist(m) {
    return m < 1000 ? Math.round(m) + ' m' : (m/1000).toFixed(1) + ' km';
}