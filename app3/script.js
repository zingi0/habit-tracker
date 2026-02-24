/**
 * HABIT TRACKER PRO - FINALE VERSION (STREAKS, NOTIFICATIONS, DARKMODE)
 */

// --- DATEN-SPEICHERUNG ---
let habits = JSON.parse(localStorage.getItem('habits')) || [];
let history = JSON.parse(localStorage.getItem('habitHistory')) || [];
let lastDate = localStorage.getItem('lastDate') || new Date().toLocaleDateString('de-DE');
let streak = parseInt(localStorage.getItem('habitStreak')) || 0;
let totalXP = parseInt(localStorage.getItem('totalXP')) || 0; // NEU: Gesamt-XP
let detailChart = null;
let selectedDays = ['all']; 
let currentDifficulty = 2; // Standard auf "Okay"
let trendChart = null;
let deletedHabitBackup = null; // Für Undo-Funktion
let undoTimeout = null;
let alertCallback = null; // Für Custom Alert
let promptCallback = null; // Für Custom Prompt

// NEU: Rang-Definition
const ranks = [
    { name: 'Neuling', xp: 0, icon: '🌱' },
    { name: 'Aufsteiger', xp: 5, icon: '⭐' },
    { name: 'Profi', xp: 15, icon: '💪' },
    { name: 'Meister', xp: 30, icon: '🏆' },
    { name: 'Großmeister', xp: 50, icon: '👑' },
    { name: 'Legende', xp: 100, icon: '✨' }
];

const quotes = [
    "„Der beste Weg, die Zukunft vorauszusagen, ist, sie zu gestalten.“",
    "„Disziplin ist die Brücke zwischen Zielen und Erfolg.“",
    "„Motivation bringt dich in Gang. Gewohnheit bringt dich voran.“",
    "„Jeder große Erfolg beginnt mit der Entscheidung, es zu versuchen.“",
    "„Kleine Schritte sind besser als gar keine Schritte.“",
    "„Erfolg ist die Summe kleiner Anstrengungen.“",
    "„Dein einziges Limit bist du selbst.“",
    "„Glaube an dich selbst und alles ist möglich.“"
];

// --- INITIALISIERUNG BEIM START ---
function init() {
    // Service Worker registrieren (für Offline-Modus)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log("Service Worker: Aktiv"))
            .catch(err => console.error("Service Worker: Fehler", err));
    }

    displayRandomQuote();
    checkDayChange();
    calculateStreak(); // Behalten wir für die Statistik
    calculateTotalXP(); // NEU
    renderRankSystem(); // NEU
    
    // Dark Mode setzen
    const savedDark = localStorage.getItem('darkMode') === 'true';
    if (savedDark) {
        document.body.classList.add('dark-mode');
    }
    updateThemeIcon(savedDark);
    
    // WICHTIG: Nur den Status der Glocke prüfen, nicht fragen!
    updateNotificationIcon();
    
    // Intervall für Erinnerungen (nur wenn Erlaubnis bereits erteilt wurde)
    if (Notification.permission === "granted") {
        setInterval(checkAndNotify, 1000 * 60 * 60 * 2);
    }
    
    saveAndRender();

    // NEU: Drag & Drop initialisieren
    const list = document.getElementById('habitList');
    if (list) {
        new Sortable(list, {
            handle: '.drag-handle', // Nur am Griff ziehbar
            animation: 150, // Schöne Animation beim Verschieben
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                // Reihenfolge speichern
                const newOrderIds = Array.from(list.children).map(li => parseInt(li.getAttribute('data-id')));
                const visibleHabits = newOrderIds.map(id => habits.find(h => h.id === id));
                const hiddenHabits = habits.filter(h => !newOrderIds.includes(h.id));
                habits = [...visibleHabits, ...hiddenHabits];
                localStorage.setItem('habits', JSON.stringify(habits));
            }
        });
    }

    // NEU: Globaler Timer-Loop (jede Sekunde)
    setInterval(() => {
        let needsRender = false;
        habits.forEach(h => {
            if (h.timerActive && h.timeLeft > 0) {
                h.timeLeft--;
                needsRender = true;
                if (h.timeLeft <= 0) {
                    h.timerActive = false;
                    h.completed = true;
                    playSound('success');
                    checkConfetti();
                }
            }
        });
        if (needsRender) saveAndRender();
    }, 1000);
}

// --- BENACHRICHTIGUNGEN (REPARIERT) ---
function updateNotificationIcon() {
    const btn = document.getElementById('notificationBtn');
    if (!btn) return;

    const isEnabled = localStorage.getItem('notificationsActive') === 'true';
    const permission = Notification.permission;

    if (permission === "granted" && isEnabled) {
        // FALL 1: Alles erlaubt und eingeschaltet
        btn.innerText = '🔔'; 
        btn.style.color = "#4caf50"; // Grün
        btn.style.opacity = "1";
    } else if (permission === "granted" && !isEnabled) {
        // FALL 2: Browser erlaubt es, aber App ist PAUSIERT
        btn.innerText = '🔕'; // Durchgestrichene Glocke
        btn.style.color = "gray"; 
        btn.style.opacity = "0.6";
    } else if (permission === "denied") {
        // FALL 3: Im Browser komplett verboten
        btn.innerText = '🔕'; 
        btn.style.color = "#ff4c4c"; // Rot
        btn.style.opacity = "1";
    } else {
        // FALL 4: Noch nie gefragt
        btn.innerText = '🔔';
        btn.style.color = "gray";
        btn.style.opacity = "0.5";
    }
}

function requestNotificationPermission() {
    if (!("Notification" in window)) return;

    const isEnabled = localStorage.getItem('notificationsActive') === 'true';

    // FALL A: Sie sind aktuell AN -> Wir schalten sie AUS
    if (Notification.permission === "granted" && isEnabled) {
        localStorage.setItem('notificationsActive', 'false');
        updateNotificationIcon();
        showCustomAlert("Benachrichtigungen pausiert. 🔇");
        return;
    }

    // FALL B: Sie sind aktuell AUS (pausiert) -> Wir schalten sie wieder AN
    if (Notification.permission === "granted" && !isEnabled) {
        localStorage.setItem('notificationsActive', 'true');
        updateNotificationIcon();
        new Notification("Wieder aktiv! 🔔", { body: "Du wirst jetzt wieder erinnert." });
        return;
    }

    // FALL C: Es wurde noch nie gefragt oder Erlaubnis wurde zurückgesetzt
    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            localStorage.setItem('notificationsActive', 'true');
            new Notification("Habit Tracker", { body: "Erinnerungen sind jetzt aktiv! 🔔" });
        } else if (permission === "denied") {
            showCustomAlert("Benachrichtigungen sind im Browser blockiert.");
        }
        updateNotificationIcon();
    });
}

// Diese Funktion muss angepasst werden, damit sie auf unsere Einstellung hört
function checkAndNotify() {
    const isEnabled = localStorage.getItem('notificationsActive') === 'true';
    if (!isEnabled || Notification.permission !== "granted") return; // Sende nichts, wenn AUS

    const todayNum = new Date().getDay();
    const openHabits = getHabitsForDayNum(todayNum).filter(h => !h.completed).length;
    const hour = new Date().getHours();
    
    if (openHabits > 0 && hour >= 17) {
        new Notification("Dranbleiben! 💪", { 
            body: `Du hast noch ${openHabits} Ziele offen!` 
        });
    }
}
// --- STREAK LOGIK ---
function calculateStreak() {
    let currentStreak = 0;
    // Zähle aufeinanderfolgende 100%-Tage in der Historie
    for (let i = 0; i < history.length; i++) {
        if (history[i].percentage === 100) {
            currentStreak++;
        } else {
            break;
        }
    }
    streak = currentStreak;
    localStorage.setItem('habitStreak', streak);
    const el = document.getElementById('streakCount');
    if (el) el.innerText = streak;
}

// NEU: Berechnet die Gesamt-XP aus der Historie
function calculateTotalXP() {
    totalXP = history.filter(entry => entry.percentage === 100).length;
    localStorage.setItem('totalXP', totalXP);
}

// NEU: Hilfsfunktion um den Rang-Index basierend auf XP zu finden
function getRankIndex(xp) {
    for (let i = ranks.length - 1; i >= 0; i--) {
        if (xp >= ranks[i].xp) return i;
    }
    return 0;
}

// --- THEME & UI ---
function updateThemeIcon(isDark) {
    const btn = document.getElementById('darkModeToggle');
    if (btn) btn.innerText = isDark ? '☀️' : '🌙';
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark);
    updateThemeIcon(isDark);

    // NEU: Passt die Statusleiste oben am Handy an
    const metaThemeColor = document.getElementById("themeMeta");
    if (metaThemeColor) {
        metaThemeColor.setAttribute("content", isDark ? "#121212" : "#f0f2f5");
    }
}

function displayRandomQuote() {
    const quoteEl = document.getElementById('quoteContainer');
    if (quoteEl && quotes && quotes.length > 0) {
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        quoteEl.innerText = randomQuote;
    } else {
        console.log("Zitat-Element oder Zitate-Array nicht gefunden!");
    }
}

// --- WOCHENPLANER ---
function toggleDay(dayStr) {
    if (dayStr === 'all') {
        selectedDays = ['all'];
    } else {
        selectedDays = selectedDays.filter(d => d !== 'all');
        if (selectedDays.includes(dayStr)) {
            selectedDays = selectedDays.filter(d => d !== dayStr);
        } else {
            selectedDays.push(dayStr);
        }
        if (selectedDays.length === 0) selectedDays = ['all'];
    }
    document.querySelectorAll('.day-btn').forEach(btn => {
        const d = btn.getAttribute('data-day');
        btn.classList.toggle('active', selectedDays.includes(d));
    });
}

function getHabitsForDayNum(dayNum) {
    return habits.filter(h => !h.days || h.days.includes('all') || h.days.includes(dayNum.toString()));
}

// --- TAGES-LOGIK ---
function checkDayChange() {
    const today = new Date().toLocaleDateString('de-DE');
    if (lastDate !== today) {
        if (habits.length > 0) {
            let yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            saveToHistory(lastDate, yesterday.getDay());
        }
        lastDate = today;
        localStorage.setItem('lastDate', lastDate);
        habits = habits.map(h => ({ ...h, completed: false }));
        calculateStreak();
    }
}

// 1. Modal öffnen statt Browser-Confirm
function finishDay() {
    document.getElementById('confirmModal').classList.remove('hidden');
}

// 2. Modal schließen
function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
}

// 3. Die eigentliche Logik (wird vom grünen Button im Modal gerufen)
function executeFinishDay() {
    const note = document.getElementById('dayNote').value; // Notiz holen
    
    // Vorher-Status für Level-Up Check
    const oldXP = totalXP;
    const oldRankIndex = getRankIndex(oldXP);

    saveToHistory(new Date().toLocaleDateString('de-DE'), new Date().getDay(), note, currentDifficulty);
    calculateTotalXP(); // XP neu berechnen
    
    habits = habits.map(h => ({ ...h, completed: false }));
    calculateStreak();
    saveAndRender();
    
    document.getElementById('dayNote').value = ''; // Feld leeren
    closeConfirmModal();
    showPage('calendar');
    renderRankSystem(); // UI aktualisieren
    
    // NEU: Level-Up Prüfung & Sounds
    const newRankIndex = getRankIndex(totalXP);
    
    if (newRankIndex > oldRankIndex) {
        playSound('levelup');
        const rankName = ranks[newRankIndex].name;
        showCustomAlert(`🎉 Herzlichen Glückwunsch! Du bist jetzt "${rankName}"!`);
        confetti({ particleCount: 300, spread: 120, origin: { y: 0.6 } });
    } else {
        playSound('success');
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
}

function saveToHistory(dateStr, dayNum, note = "", diff = 2) {
    const activeHabits = getHabitsForDayNum(dayNum);
    const completed = activeHabits.filter(h => h.completed);
    const perc = activeHabits.length === 0 ? 0 : Math.round((completed.length / activeHabits.length) * 100);
    
    const stats = {
        sport: completed.filter(h => h.category === 'sport').length,
        lernen: completed.filter(h => h.category === 'lernen').length,
        gesundheit: completed.filter(h => h.category === 'gesundheit').length,
        alltag: completed.filter(h => h.category === 'alltag').length
    };

    // Hier speichern wir die neuen Daten mit ab
    history.unshift({ 
        date: dateStr, 
        percentage: perc, 
        stats: stats, 
        note: note, 
        difficulty: diff 
    });
    localStorage.setItem('habitHistory', JSON.stringify(history));
}

// --- HABIT-AKTIONEN ---
function openAddModal() {
    document.getElementById('addHabitModal').classList.remove('hidden');
    document.getElementById('modalHabitInput').focus();
}

function closeAddModal() {
    document.getElementById('addHabitModal').classList.add('hidden');
}

function addHabitFromModal() {
    const input = document.getElementById('modalHabitInput');
    const cat = document.getElementById('modalCategoryInput');
    const durInput = document.getElementById('modalDurationInput');
    
    if (!input.value.trim()) return;
    
    const duration = parseInt(durInput.value) || 0; // Minuten

    habits.push({ 
        id: Date.now(), 
        text: input.value, 
        category: cat.value, 
        completed: false,
        days: [...selectedDays],
        duration: duration, // Gesamtzeit in Minuten
        timeLeft: duration * 60, // Restzeit in Sekunden
        timerActive: false
    });
    
    input.value = '';
    durInput.value = '';
    closeAddModal();
    saveAndRender();
}

function toggleHabit(id) {
    let newlyDone = false;
    habits = habits.map(h => {
        if (h.id === id) {
            if (!h.completed) newlyDone = true;
            // Wenn Timer lief, stoppen wir ihn beim manuellen Abhaken
            if (h.timerActive) h.timerActive = false;
            return { ...h, completed: !h.completed };
        }
        return h;
    });
    saveAndRender();
    if (newlyDone) checkConfetti();
}

function toggleTimer(id) {
    habits = habits.map(h => {
        if (h.id === id) {
            // Wenn Timer abgelaufen war und neu gestartet wird -> Reset
            if (h.timeLeft <= 0) {
                h.timeLeft = h.duration * 60;
                h.completed = false;
            }
            return { ...h, timerActive: !h.timerActive };
        }
        return h;
    });
    saveAndRender();
}

function deleteHabit(id, btnElement) {
    // Finde das LI-Element (Eltern-Element des Buttons)
    const li = btnElement.closest('li');
    
    // Animation hinzufügen
    li.classList.add('slide-out');

    // Warten bis Animation fertig ist, dann Daten löschen
    setTimeout(() => {
        // Backup erstellen
        const habitToDelete = habits.find(h => h.id === id);
        if (habitToDelete) {
            deletedHabitBackup = habitToDelete;
            showUndoToast();
        }
        
        habits = habits.filter(h => h.id !== id);
        saveAndRender();
    }, 400); // 400ms entspricht der CSS Animation
}

function showUndoToast() {
    const toast = document.getElementById('undoToast');
    toast.classList.remove('hidden');
    
    // Vorherigen Timeout löschen, falls man schnell hintereinander löscht
    if (undoTimeout) clearTimeout(undoTimeout);
    
    // Nach 5 Sekunden ausblenden
    undoTimeout = setTimeout(() => {
        toast.classList.add('hidden');
        deletedHabitBackup = null; // Backup verwerfen
    }, 5000);
}

function undoDelete() {
    if (deletedHabitBackup) {
        habits.push(deletedHabitBackup);
        // Sortieren, damit es nicht immer ganz unten landet (optional, hier nach ID/Erstellzeit)
        habits.sort((a, b) => a.id - b.id);
        saveAndRender();
        
        document.getElementById('undoToast').classList.add('hidden');
        deletedHabitBackup = null;
        clearTimeout(undoTimeout);
    }
}

function editHabit(id) {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;

    showCustomPrompt("Ziel umbenennen:", habit.text, (newText) => {
        if (newText && newText.trim() !== "") {
            habit.text = newText.trim();
            saveAndRender();
        }
    });
}

// Helfer: Sekunden in MM:SS formatieren
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// --- RENDERING ---
function saveAndRender() {
    localStorage.setItem('habits', JSON.stringify(habits));
    const list = document.getElementById('habitList');
    if (!list) return;
    
    list.innerHTML = '';
    const todayNum = new Date().getDay();
    const todayHabits = getHabitsForDayNum(todayNum);

    if (todayHabits.length === 0) {
        list.innerHTML = '<p style="text-align:center; opacity:0.6; margin-top:20px;">Heute keine geplanten Ziele. 🔥</p>';
    }

    todayHabits.forEach(h => {
        const li = document.createElement('li');
        li.className = `cat-${h.category} ${h.completed ? 'completed' : ''}`;
        li.setAttribute('data-id', h.id); // Wichtig für SortableJS
        
        // Timer HTML generieren, falls Dauer gesetzt ist
        let timerHtml = '';
        if (h.duration > 0) {
            const icon = h.timerActive ? '⏸️' : '▶️';
            timerHtml = `<span class="timer-badge">
                            <button class="timer-btn" onclick="toggleTimer(${h.id}); event.stopPropagation();">${icon}</button>
                            ${formatTime(h.timeLeft)}
                         </span>`;
        }

        li.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span class="drag-handle">⋮⋮</span>
                <input type="checkbox" ${h.completed ? 'checked' : ''} onchange="toggleHabit(${h.id})">
                <span onclick="editHabit(${h.id})" style="cursor:pointer;">${h.text}</span>
                ${timerHtml}
            </div>
            <button onclick="deleteHabit(${h.id}, this)" style="border:none; background:none; color:#ff4c4c; cursor:pointer; padding:5px;">✕</button>`;
        
        // --- SWIPE TO DELETE LOGIK ---
        let touchStartX = 0;
        let touchCurrentX = 0;

        li.addEventListener('touchstart', (e) => {
            // Wenn wir den Drag-Handle berühren, kein Swipe starten!
            if (e.target.classList.contains('drag-handle')) return;

            touchStartX = e.touches[0].clientX;
            touchCurrentX = touchStartX;
            li.style.transition = 'none'; // Sofortige Reaktion ohne Verzögerung
        }, {passive: true});

        li.addEventListener('touchmove', (e) => {
            touchCurrentX = e.touches[0].clientX;
            const diff = touchCurrentX - touchStartX;
            
            // Nur wenn nach LINKS gewischt wird (diff negativ)
            if (diff < 0) {
                li.style.transform = `translateX(${diff}px)`;
                li.style.opacity = Math.max(0.5, 1 - Math.abs(diff) / 200); // Wird transparenter
            }
        }, {passive: true});

        li.addEventListener('touchend', () => {
            const diff = touchCurrentX - touchStartX;
            li.style.transition = 'transform 0.3s ease, opacity 0.3s ease'; // Animation aktivieren
            
            if (diff < -100) { // Wenn weit genug gewischt (Schwelle)
                li.style.transform = 'translateX(-100%)'; // Rausfliegen lassen
                li.style.opacity = '0';
                setTimeout(() => {
                    habits = habits.filter(item => item.id !== h.id); // Löschen
                    saveAndRender();
                }, 300);
            } else {
                li.style.transform = 'translateX(0)'; // Zurückschnappen
                li.style.opacity = '1';
            }
        });
        // -----------------------------

        list.appendChild(li);
    });
    updateProgress();
}

function renderRankSystem() {
    // 1. Finde aktuellen und nächsten Rang
    let currentRank = ranks[0];
    let nextRank = ranks[1];
    // Wir gehen von hinten durch, um den höchsten erreichten Rang zu finden
    for (let i = ranks.length - 1; i >= 0; i--) {
        if (totalXP >= ranks[i].xp) {
            currentRank = ranks[i];
            nextRank = ranks[i + 1] || null; // null, wenn der höchste Rang erreicht ist
            break;
        }
    }

    // 2. Berechne den Fortschritt in Prozent
    let progress = 0;
    if (nextRank) {
        const xpInThisRank = totalXP - currentRank.xp;
        const xpNeededForRank = nextRank.xp - currentRank.xp;
        progress = xpNeededForRank > 0 ? (xpInThisRank / xpNeededForRank) * 100 : 100;
    } else { // Höchster Rang erreicht
        progress = 100;
    }

    // 3. Aktualisiere die HTML-Elemente
    // Große Karte auf der Rang-Seite
    const iconEl = document.getElementById('rankIconLarge');
    const nameEl = document.getElementById('rankNameLarge');
    const infoEl = document.getElementById('rankInfoLarge');
    const barEl = document.getElementById('rankProgressBarLarge');

    if(iconEl) iconEl.innerText = currentRank.icon;
    if(nameEl) nameEl.innerText = currentRank.name;
    if(infoEl) infoEl.innerText = nextRank ? `${totalXP} / ${nextRank.xp} XP` : `${totalXP} XP (Max)`;
    if(barEl) barEl.style.width = `${progress}%`;

    // Timeline generieren
    const timelineContainer = document.getElementById('rankTimeline');
    if(timelineContainer) {
        timelineContainer.innerHTML = '';
        ranks.forEach(r => {
            const isUnlocked = totalXP >= r.xp;
            const isCurrent = r.name === currentRank.name;
            
            const div = document.createElement('div');
            div.className = `timeline-item ${isUnlocked ? 'unlocked' : ''} ${isCurrent ? 'current' : ''}`;
            div.innerHTML = `
                <span class="timeline-icon">${r.icon}</span>
                <div class="timeline-info">
                    <div style="font-weight:bold;">${r.name}</div>
                    <div style="font-size:0.8rem; opacity:0.7;">${r.xp} XP benötigt</div>
                </div>
                ${isUnlocked ? '✅' : '🔒'}
            `;
            timelineContainer.appendChild(div);
        });
    }
}

function updateProgress() {
    const todayHabits = getHabitsForDayNum(new Date().getDay());
    const perc = todayHabits.length === 0 ? 0 : Math.round((todayHabits.filter(h => h.completed).length / todayHabits.length) * 100);
    const bar = document.getElementById('progressBar');
    const txt = document.getElementById('progressText');
    if (bar) bar.style.width = perc + '%';
    if (txt) txt.innerText = perc + '% geschafft';
}

function checkConfetti() {
    const todayHabits = getHabitsForDayNum(new Date().getDay());
    if (todayHabits.length > 0 && todayHabits.every(h => h.completed)) {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }
}

// --- NAVIGATION & HISTORIE ---
function showPage(pageId) {
    document.getElementById('todoPage').classList.toggle('hidden', pageId !== 'todo');
    document.getElementById('calendarPage').classList.toggle('hidden', pageId !== 'calendar');
    document.getElementById('rankPage').classList.toggle('hidden', pageId !== 'rank');
    
    document.getElementById('navTodo').classList.toggle('active', pageId === 'todo');
    document.getElementById('navCalendar').classList.toggle('active', pageId === 'calendar');
    document.getElementById('navRank').classList.toggle('active', pageId === 'rank');
    
    // Titel setzen
    const titles = { 'todo': 'Tages-Ziele', 'calendar': 'Statistik', 'rank': 'Rangliste' };
    document.getElementById('pageTitle').innerText = titles[pageId] || 'Habit Tracker';
    
    if (pageId === 'calendar') {
        renderHistory();
        updateStats(); // <--- NEU
        setTimeout(renderTrendChart, 50);
    }
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    list.innerHTML = history.length === 0 ? '<p style="text-align:center; opacity:0.5;">Noch kein Verlauf gespeichert.</p>' : '';
    
    history.forEach((entry, i) => {
        const item = document.createElement('div');
        let statusClass = 'poor';
        if (entry.percentage === 100) statusClass = 'excellent';
        else if (entry.percentage >= 70) statusClass = 'good';
        else if (entry.percentage >= 30) statusClass = 'okay';
        
        item.className = `history-item ${statusClass}`;
        item.onclick = () => openDetail(i);
        item.innerHTML = `<span>${entry.percentage === 100 ? '🏆' : '📈'} ${entry.date}</span><span class="history-perc">${entry.percentage}% ›</span>`;
        list.appendChild(item);
    });
}

// --- MODAL & DETAIL-DIAGRAMM ---
function openDetail(index) {
    const entry = history[index];
    if (!entry.stats) return showCustomAlert("Keine Detaildaten verfügbar.");
    document.getElementById('detailModal').classList.remove('hidden');
    document.getElementById('modalDate').innerText = entry.date;
    
    // Journal Text zusammenbauen
    const diffEmojis = ["😊 Leicht", "😐 Okay", "😫 Schwer"];
    const diffText = entry.difficulty ? diffEmojis[entry.difficulty - 1] : "Keine Info";
    
    document.getElementById('modalStatsText').innerHTML = `
        <div style="text-align: left; margin-top: 10px;">
            <p><strong>Erfolg:</strong> ${entry.percentage}% | <strong>Gefühl:</strong> ${diffText}</p>
            <p style="font-style: italic; background: rgba(0,0,0,0.05); padding: 10px; border-radius: 8px;">
                "${entry.note || 'Keine Notiz vorhanden.'}"
            </p>
        </div>
    `;
    
    // ... dein Chart Code bleibt genau wie er ist ...
    const ctx = document.getElementById('detailChart').getContext('2d');
    if (detailChart) detailChart.destroy();
    const isDarkMode = document.body.classList.contains('dark-mode');
    detailChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Sport', 'Lernen', 'Gesund', 'Alltag'],
            datasets: [{ 
                data: [entry.stats.sport, entry.stats.lernen, entry.stats.gesundheit, entry.stats.alltag], 
                backgroundColor: ['#ff9800', '#2196f3', '#4caf50', '#9e9e9e'],
                borderColor: isDarkMode ? '#1e1e1e' : '#fff',
                borderWidth: 2
            }]
        },
        options: { plugins: { legend: { position: 'bottom', labels: { color: isDarkMode ? '#fff' : '#333' } } } }
    });
}

function setDifficulty(level) {
    currentDifficulty = level;
    
    // 1. Alle drei Buttons finden
    const btn1 = document.getElementById('diff1');
    const btn2 = document.getElementById('diff2');
    const btn3 = document.getElementById('diff3');
    const allBtns = [btn1, btn2, btn3];

    // 2. Bei allen Buttons erstmal alle Farb-Klassen entfernen
    allBtns.forEach(btn => {
        if (btn) {
            btn.classList.remove('active-easy', 'active-medium', 'active-hard', 'active');
        }
    });

    // 3. Dem angeklickten Button die richtige Farbe geben
    const targetBtn = document.getElementById(`diff${level}`);
    if (targetBtn) {
        if (level === 1) targetBtn.classList.add('active-easy');
        else if (level === 2) targetBtn.classList.add('active-medium');
        else if (level === 3) targetBtn.classList.add('active-hard');
    }
}

function renderTrendChart() {
    const chartCanvas = document.getElementById('trendChart');
    if (!chartCanvas) {
        console.log("Canvas für TrendChart fehlt im HTML.");
        return;
    }

    const ctx = chartCanvas.getContext('2d');
    
    // 1. Daten sicher sortieren (älteste nach links, neuste nach rechts)
    let sortedHistory = [...history].sort((a, b) => {
        const partsA = a.date.split('.'); 
        const partsB = b.date.split('.');
        if(partsA.length < 2 || partsB.length < 2) return 0;
        const dateA = new Date(partsA[2], partsA[1] - 1, partsA[0]);
        const dateB = new Date(partsB[2], partsB[1] - 1, partsB[0]);
        return dateA - dateB;
    });

    // 2. Maximal die letzten 7 Tage
    let lastSeven = sortedHistory.slice(-7);

    // TRICK: Wenn wir nur 1 Tag haben, erfinden wir einen Startpunkt
    if (lastSeven.length === 1) {
        lastSeven.unshift({ date: "Start", percentage: 0 });
    }

    // 3. Labels (X-Achse) und Daten (Y-Achse) vorbereiten
    const labels = lastSeven.map(entry => {
        if (entry.date === "Start") return "Start";
        const parts = entry.date.split('.');
        return `${parts[0]}.${parts[1]}.`;
    });
    const dataPoints = lastSeven.map(entry => entry.percentage);

    // 4. Altes Chart löschen, falls vorhanden
    if (trendChart !== null) {
        trendChart.destroy();
    }

    // 5. Farben festlegen (Krypto-Style)
    const isDarkMode = document.body.classList.contains('dark-mode');
    let lineColor = '#4caf50'; 
    if (dataPoints.length >= 2 && dataPoints[dataPoints.length - 1] < dataPoints[0]) {
        lineColor = '#f44336'; 
    }

    // 6. Zeichnen!
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Dein Erfolg',
                    data: dataPoints,
                    borderColor: lineColor,
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    tension: 0.4,
                    pointRadius: 5, // Punkte auf der Linie sichtbar machen
                    pointBackgroundColor: lineColor,
                    fill: true,
                    backgroundColor: (context) => {
                        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
                        gradient.addColorStop(0, lineColor + '44');
                        gradient.addColorStop(1, 'transparent');
                        return gradient;
                    }
                },
                {
                    label: 'Ziel',
                    data: new Array(dataPoints.length).fill(100),
                    borderColor: '#ffc107',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true, 
                    max: 100,
                    grid: { color: isDarkMode ? '#333' : '#eee' },
                    ticks: { color: isDarkMode ? '#aaa' : '#666', stepSize: 25 }
                },
                x: { 
                    grid: { display: false },
                    ticks: { color: isDarkMode ? '#aaa' : '#666' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function updateStats() {
    if (history.length === 0) return;

    // 1. Wochen-Durchschnitt (letzte 7 Einträge)
    const lastSeven = history.slice(0, 7);
    const avg = Math.round(lastSeven.reduce((sum, entry) => sum + entry.percentage, 0) / lastSeven.length);
    document.getElementById('statAverage').innerText = avg + "%";

    // 2. All-Time Best (höchster Wert in der gesamten History)
    const best = Math.max(...history.map(entry => entry.percentage));
    document.getElementById('statBest').innerText = best + "%";
    
    // Farbe anpassen: Wenn Schnitt gut ist, grün, sonst orange
    document.getElementById('statAverage').style.color = avg >= 80 ? '#4caf50' : '#ff9800';
}

function closeModal() {
    const modal = document.getElementById('detailModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// --- BACKUP & SETTINGS ---
function openSettings() {
    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
}

function exportData() {
    const data = {
        habits: habits,
        history: history,
        streak: streak,
        lastDate: lastDate,
        darkMode: localStorage.getItem('darkMode'),
        notificationsActive: localStorage.getItem('notificationsActive')
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "habit_tracker_backup_" + new Date().toISOString().slice(0,10) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importData(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.habits && data.history) {
                localStorage.setItem('habits', JSON.stringify(data.habits));
                localStorage.setItem('habitHistory', JSON.stringify(data.history));
                localStorage.setItem('habitStreak', data.streak || 0);
                localStorage.setItem('lastDate', data.lastDate || new Date().toLocaleDateString('de-DE'));
                showCustomAlert("Backup erfolgreich geladen! Die App wird neu gestartet.", () => {
                    location.reload();
                });
            } else {
                showCustomAlert("Ungültige Backup-Datei.");
            }
        } catch (err) {
            showCustomAlert("Fehler beim Lesen der Datei.");
        }
    };
    reader.readAsText(file);
}

// --- CUSTOM POPUPS (Eigener Alert & Prompt) ---
function showCustomAlert(message, callback = null) {
    document.getElementById('customAlertMessage').innerText = message;
    document.getElementById('customAlertModal').classList.remove('hidden');
    alertCallback = callback;
}

function closeCustomAlert() {
    document.getElementById('customAlertModal').classList.add('hidden');
    if (alertCallback) {
        alertCallback();
        alertCallback = null;
    }
}

function showCustomPrompt(title, defaultValue, callback) {
    document.getElementById('customPromptTitle').innerText = title;
    const input = document.getElementById('customPromptInput');
    input.value = defaultValue;
    document.getElementById('customPromptModal').classList.remove('hidden');
    input.focus(); // Fokus direkt ins Feld setzen
    promptCallback = callback;
}

function closeCustomPrompt() {
    document.getElementById('customPromptModal').classList.add('hidden');
    promptCallback = null;
}

function confirmCustomPrompt() {
    const val = document.getElementById('customPromptInput').value;
    if (promptCallback) {
        promptCallback(val);
    }
    closeCustomPrompt();
}

// --- TEILEN FUNKTIONEN ---
function openShareModal() {
    document.getElementById('shareModal').classList.remove('hidden');
}

function closeShareModal() {
    document.getElementById('shareModal').classList.add('hidden');
}

async function shareText() {
    // Finde den aktuellen Rang für den Text
    let currentRankName = 'Neuling';
    for (let i = ranks.length - 1; i >= 0; i--) {
        if (totalXP >= ranks[i].xp) {
            currentRankName = ranks[i].name;
            break;
        }
    }

    const text = `Ich habe den Rang '${currentRankName}' (${totalXP} XP) im Habit Tracker erreicht! Mein aktueller Streak: ${streak} Tage. 🔥`;
    if (navigator.share) {
        try {
            await navigator.share({ title: 'Mein Habit Tracker Erfolg', text: text });
        } catch (err) { console.log('Teilen abgebrochen', err); }
    } else {
        navigator.clipboard.writeText(text).then(() => showCustomAlert("Text kopiert! 📋"));
    }
    closeShareModal();
}

function shareChart() {
    // Prüfen, ob Chart existiert (wird erst beim Aufruf der Statistik-Seite erstellt)
    if (!trendChart) {
        closeShareModal();
        showCustomAlert("Bitte öffne erst einmal die Statistik-Seite, um das Diagramm zu laden.");
        return;
    }
    
    const canvas = document.getElementById('trendChart');
    canvas.toBlob(async (blob) => {
        const file = new File([blob], "habit-trend.png", { type: "image/png" });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: 'Mein Erfolgstrend', text: `Mein aktueller Trend! 🔥 Streak: ${streak}` });
            } catch (err) { console.log(err); }
        } else {
            const a = document.createElement('a'); a.href = canvas.toDataURL(); a.download = 'habit-trend.png'; a.click();
            showCustomAlert("Bild heruntergeladen (Teilen nicht unterstützt).");
        }
        closeShareModal();
    });
}

// --- SOUND EFFEKTE (Web Audio API) ---
function playSound(type) {
    // Prüfen ob AudioContext verfügbar ist
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    if (type === 'success') {
        // Hell, freundlich, aufsteigend (Sinus-Welle)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5 (Oktave höher)
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5); // Ausblenden
        
        osc.start(now);
        osc.stop(now + 0.5);
    } 
    else if (type === 'levelup') {
        // Fanfare: C - E - G - C (C-Dur Arpeggio)
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle'; // Dreieckswelle klingt etwas "trompetiger"
            osc.frequency.value = freq;
            
            const start = now + (i * 0.1); // Versetzt abspielen
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.1, start + 0.05);
            gain.gain.linearRampToValueAtTime(0, start + 0.4);
            
            osc.start(start);
            osc.stop(start + 0.4);
        });
    }
}


init();