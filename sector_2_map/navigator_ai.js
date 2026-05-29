// ── NAVIGATOR AI — Walking-first, ORS-powered navigator ──

var NavigatorAI = {

    _target:    null,
    _mode:      'walk',
    _route:     null,
    _stepIndex: 0,
    _routeLine: null,
    _interval:  null,
    _totalDuration: 0,   // ORS duration in seconds
    _startTime:     0,   // when navigation started

    // ── START ──
    start: function(toilet, mode) {
        this._target    = toilet;
        this._mode      = mode || 'walk';
        this._stepIndex = 0;
        this._startTime = Date.now();
        this._fetchRoute();
    },

    // ── FETCH ROUTE FROM OpenRouteService ──
    _fetchRoute: function() {
        if (userLat === null) { alert('GPS not ready'); return; }

        var profile = (typeof ORS_PROFILES !== 'undefined' ? ORS_PROFILES[this._mode] : null) ||
                      { walk:'foot-walking', bike:'cycling-regular', drive:'driving-car' }[this._mode] ||
                      'foot-walking';

        var url = 'https://api.openrouteservice.org/v2/directions/' + profile + '/geojson';
        var body = JSON.stringify({
            coordinates: [
                [userLon, userLat],
                [this._target.lon, this._target.lat]
            ],
            instructions: true,
            preference: 'recommended'
        });

        setStatus('Calculating route...', true);

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImUxNTAzMmRkYjQ3ODQ2YTc5OWI4ZmFjNDQzNjUzNDRkIiwiaCI6Im11cm11cjY0In0='
            },
            body: body
        })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data || !data.features || !data.features.length) {
                    NavigatorAI._fallback(); return;
                }
                var route = data.features[0];
                if (route.properties && route.properties.summary) {
                    route.distance = route.properties.summary.distance;
                    route.duration = route.properties.summary.duration;
                }
                route.legs = [{ steps: [] }];
                NavigatorAI._onRoute(route);
            })
            .catch(function() { NavigatorAI._fallback(); });
    },

    // ── ROUTE LOADED ──
    _onRoute: function(route) {
        this._route         = route;
        this._stepIndex     = 0;
        this._totalDuration = route.duration; // seconds — straight from ORS summary

        // Draw route line
        if (this._routeLine) map.removeLayer(this._routeLine);
        var coords = route.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
        this._routeLine = L.polyline(coords, {
            color:'#1a4a8a', weight:6, opacity:0.9
        }).addTo(map);
        map.fitBounds(this._routeLine.getBounds(), { padding:[60, 80] });

        // Show nav panel
        document.getElementById('nav-panel').style.display = 'flex';

        // 2s tick for walkers, 3s for vehicles
        this.tick();
        if (this._interval) clearInterval(this._interval);
        var tickRate = this._mode === 'walk' ? 2000 : 3000;
        this._interval = setInterval(function() { NavigatorAI.tick(); }, tickRate);
    },

    // ── FALLBACK — straight line ──
    _fallback: function() {
        if (this._routeLine) map.removeLayer(this._routeLine);
        this._routeLine = L.polyline(
            [[userLat, userLon], [this._target.lat, this._target.lon]],
            { color:'#1a4a8a', weight:5, opacity:0.85, dashArray:'12,8' }
        ).addTo(map);
        map.fitBounds(this._routeLine.getBounds(), { padding:[60, 80] });
        document.getElementById('nav-panel').style.display = 'flex';

        // Estimate duration in fallback only
        var dist    = haversine(userLat, userLon, this._target.lat, this._target.lon);
        var speedMs = { walk:1.4, bike:4.2, drive:8.0 }[this._mode] || 1.4;
        this._totalDuration = dist / speedMs;

        this.tick();
    },

    // ── TICK ──
    tick: function() {
        if (!this._target || userLat === null) return;

        var distToTarget = haversine(userLat, userLon, this._target.lat, this._target.lon);

        // Arrival radius — tighter for walkers
        var arrivalRadius = this._mode === 'walk' ? 15 : 25;
        if (distToTarget < arrivalRadius) { this._arrived(); return; }

        // Trim route line to current position
        if (this._routeLine && this._route) {
            var coords = this._route.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
            this._routeLine.setLatLngs(this._trimCoords(coords));
        }

        var stepInfo = this._getStep();
        var eta      = this._calcETA(distToTarget);

        this._updatePanel(stepInfo, eta);
    },

    // ── SMART ETA — use ORS summary.duration with 15% buffer ──
    _calcETA: function(remainingDist) {
        // Prefer ORS-provided route duration (in seconds) and scale it
        if (this._route && typeof this._route.distance === 'number' && this._totalDuration > 0) {
            var remainingRouteDist = this._remainingRouteDistance();
            if (remainingRouteDist === null) remainingRouteDist = this._route.distance;
            var fraction = Math.min(Math.max(remainingRouteDist / this._route.distance, 0), 1);
            var remainingSecs = Math.ceil(this._totalDuration * fraction);
            // Add conservative 15% buffer for unexpected delays and always round up
            remainingSecs = Math.ceil(remainingSecs * 1.15);
            return this._formatDuration(remainingSecs);
        }

        // Fallback: use straight-line distance with a conservative speed and 15% buffer
        var dist = remainingDist;
        if (dist === null || typeof dist !== 'number') return this._formatDuration(60);
        var speedMs = 1.11; // default 4 km/h
        if (this._mode === 'bike') speedMs = 2.78; // 10 km/h
        if (this._mode === 'drive') speedMs = 8.33; // 30 km/h
        var secs = dist / speedMs;
        secs = Math.ceil(secs * 1.15);
        return this._formatDuration(secs);
    },

    // ── REMAINING ROUTE DISTANCE ──
    _remainingRouteDistance: function() {
        if (!this._route || !this._route.geometry || !Array.isArray(this._route.geometry.coordinates)) {
            return null;
        }
        var coords = this._route.geometry.coordinates;
        var closestIndex = 0;
        var closestDist = Infinity;
        for (var i = 0; i < coords.length; i++) {
            var lat = coords[i][1];
            var lon = coords[i][0];
            var d = haversine(userLat, userLon, lat, lon);
            if (d < closestDist) {
                closestDist = d;
                closestIndex = i;
            }
        }
        var total = 0;
        for (var j = closestIndex; j < coords.length - 1; j++) {
            total += haversine(coords[j][1], coords[j][0], coords[j+1][1], coords[j+1][0]);
        }
        return total;
    },

    // ── TRAFFIC MULTIPLIER — Israel time-of-day ──
    _trafficMultiplier: function() {
        var h   = new Date().getHours();
        var day = new Date().getDay(); // 0=Sun, 5=Fri, 6=Sat
        if (day === 6)                          return 0.8;  // Shabbat — clear roads
        if (day === 5 && h >= 13 && h <= 17)   return 1.7;  // Friday rush
        if (h >= 7  && h <= 9)                 return 1.6;  // Morning rush
        if (h >= 16 && h <= 19)                return 1.5;  // Evening rush
        if (h >= 22 || h <= 5)                 return 0.85; // Night
        return 1.1;                                          // Normal daytime
    },

    // ── FORMAT DURATION from seconds ──
    _formatDuration: function(seconds) {
        if (seconds < 60) return '1 min';
        var mins = Math.ceil(seconds / 60);
        if (mins >= 60) {
            var hrs = Math.floor(mins / 60);
            var rem = mins % 60;
            return hrs + 'h ' + (rem > 0 ? rem + 'm' : '');
        }
        return mins + ' min';
    },

    // ── TRIM PASSED COORDS ──
    _trimCoords: function(coords) {
        var closest = 0, minDist = Infinity;
        for (var i = 0; i < coords.length; i++) {
            var d = haversine(userLat, userLon, coords[i][0], coords[i][1]);
            if (d < minDist) { minDist = d; closest = i; }
        }
        return [[userLat, userLon]].concat(coords.slice(closest));
    },

    // ── GET CURRENT STEP — distance to next turn ──
    _getStep: function() {
        if (!this._route || !this._route.legs || !this._route.legs[0]) {
            return { arrow:'↑', instruction:'Head to ' + this._target.name, distToTurn:null };
        }

        var steps = this._route.legs[0].steps;
        if (!steps || !steps.length) {
            return { arrow:'↑', instruction:'Head to ' + this._target.name, distToTurn:null };
        }

        // Tighter threshold for walking — 20m vs 40m for vehicles
        var threshold = this._mode === 'walk' ? 20 : 40;

        // Advance step index when we've passed the current maneuver
        var currentLoc      = steps[this._stepIndex].maneuver.location;
        var distToCurrent   = haversine(userLat, userLon, currentLoc[1], currentLoc[0]);
        if (distToCurrent < threshold && this._stepIndex < steps.length - 1) {
            this._stepIndex++;
        }

        var step     = steps[this._stepIndex];
        var nextStep = steps[Math.min(this._stepIndex + 1, steps.length - 1)];
        var type     = step.maneuver.type;
        var modifier = step.maneuver.modifier || '';
        var street   = nextStep.name || step.name || this._target.name;

        // Distance to NEXT maneuver — this is what shows in the nav panel
        var nextLoc    = nextStep.maneuver.location;
        var distToTurn = haversine(userLat, userLon, nextLoc[1], nextLoc[0]);

        return {
            arrow:       this._arrow(type, modifier),
            instruction: this._instruction(type, modifier, street),
            distToTurn:  distToTurn
        };
    },

    // ── ARROW ──
    _arrow: function(type, mod) {
        if (type === 'arrive')                          return '🚽';
        if (type === 'depart')                          return '↑';
        if (mod.indexOf('sharp right') !== -1)          return '↪';
        if (mod.indexOf('sharp left')  !== -1)          return '↩';
        if (mod.indexOf('slight right') !== -1)         return '↗';
        if (mod.indexOf('slight left')  !== -1)         return '↖';
        if (mod.indexOf('right') !== -1)                return '→';
        if (mod.indexOf('left')  !== -1)                return '←';
        if (mod.indexOf('uturn') !== -1)                return '↩';
        if (type === 'roundabout' || type === 'rotary') return '🔄';
        return '↑';
    },

    // ── INSTRUCTION ──
    _instruction: function(type, mod, street) {
        if (type === 'arrive')    return 'Arrived! ' + this._target.name;
        if (type === 'depart')    return 'Head towards ' + this._target.name;
        if (type === 'turn') {
            if (mod.indexOf('sharp right') !== -1)  return 'Sharp right onto ' + street;
            if (mod.indexOf('sharp left')  !== -1)  return 'Sharp left onto ' + street;
            if (mod.indexOf('slight right') !== -1) return 'Bear right onto ' + street;
            if (mod.indexOf('slight left')  !== -1) return 'Bear left onto ' + street;
            if (mod.indexOf('right') !== -1)        return 'Turn right onto ' + street;
            if (mod.indexOf('left')  !== -1)        return 'Turn left onto ' + street;
        }
        if (type === 'new name')   return 'Continue onto ' + street;
        if (type === 'continue')   return 'Continue on ' + street;
        if (type === 'merge')      return 'Merge onto ' + street;
        if (type === 'roundabout') return 'Enter roundabout';
        if (type === 'rotary')     return 'Enter rotary';
        if (type === 'fork') {
            if (mod.indexOf('right') !== -1) return 'Keep right';
            return 'Keep left';
        }
        if (type === 'end of road') {
            if (mod.indexOf('right') !== -1) return 'Turn right';
            return 'Turn left';
        }
        return 'Continue to ' + this._target.name;
    },

    // ── UPDATE PANEL ──
    _updatePanel: function(stepInfo, eta) {
        var icon = TRAVEL_ICONS[this._mode] || '🚶';

        document.getElementById('nav-arrow').textContent     = stepInfo.arrow;
        document.getElementById('nav-street').textContent    = stepInfo.instruction;
        document.getElementById('nav-eta').textContent       = eta;
        document.getElementById('nav-mode-icon').textContent = icon;

        // Distance to next turn, otherwise show remaining route distance
        if (stepInfo.distToTurn !== null && stepInfo.distToTurn < 5000) {
            document.getElementById('nav-dist').textContent = 'In ' + fmtDist(stepInfo.distToTurn);
        } else {
            var remaining = this._remainingRouteDistance();
            if (remaining === null && this._route && typeof this._route.distance === 'number') {
                remaining = this._route.distance;
            }
            if (remaining === null) {
                remaining = haversine(userLat, userLon, this._target.lat, this._target.lon);
            }
            document.getElementById('nav-dist').textContent = fmtDist(remaining);
        }

        // Pulse arrow on turns
        if (stepInfo.arrow !== '↑' && stepInfo.arrow !== '🚽') {
            var el = document.getElementById('nav-arrow');
            el.style.animation = 'none';
            setTimeout(function() {
                el.style.animation = 'pulse-arrow 0.5s ease-in-out 3';
            }, 10);
        }
    },

    // ── ARRIVED ──
    _arrived: function() {
        document.getElementById('nav-arrow').textContent  = '🚽';
        document.getElementById('nav-dist').textContent   = "You're here!";
        document.getElementById('nav-street').textContent = this._target.name;
        document.getElementById('nav-eta').textContent    = '0 min';

        this._awardScore(this._target.id);
        setTimeout(function() { NavigatorAI.stop(); }, 4000);
    },

    // ── AWARD SCORE ──
    _awardScore: function(toiletId) {
        var userName = localStorage.getItem('username') || 'anonymous';
        var scores   = {};
        try { scores = JSON.parse(localStorage.getItem('game_scores') || '{}'); } catch(e) {}
        if (!scores[toiletId]) scores[toiletId] = {};
        scores[toiletId][userName] = (scores[toiletId][userName] || 0) + 1;
        localStorage.setItem('game_scores', JSON.stringify(scores));
        refreshMarker(toiletId);
    },

    // ── STOP ──
    stop: function() {
        this._target        = null;
        this._route         = null;
        this._stepIndex     = 0;
        this._totalDuration = 0;

        window._navigating = false;
        window._navTarget  = null;

        if (this._routeLine) {
            map.removeLayer(this._routeLine);
            this._routeLine = null;
        }
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }

        document.getElementById('nav-panel').style.display   = 'none';
        document.getElementById('nearest-bar').style.display = 'flex';
        setStatus('GPS locked', true);
    }
};
