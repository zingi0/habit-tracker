
let habits = JSON.parse(localStorage.getItem('habits')) || [];
let history = JSON.parse(localStorage.getItem('habitHistory')) || [];
let lastDate = localStorage.getItem('lastDate') || new Date().toLocaleDateString('de-DE');
let streak = parseInt(localStorage.getItem('habitStreak')) || 0;
let totalXP = parseInt(localStorage.getItem('totalXP')) || 0;
let detailChart = null;
let modalSelectedDays = ['all']; 
let viewingDay = 'today'; 
let currentDifficulty = 2; 
let trendChart = null;
let deletedHabitBackup = null; 
let undoTimeout = null;
let alertCallback = null;
let promptCallback = null;
let notificationTimeoutId = null; 
let scheduledHabits = JSON.parse(localStorage.getItem('scheduledHabits')) || {};
let calendarCursor = new Date(); // month being viewed in calendar
let scheduledTimers = {}; // habitId/date -> timeout id

// Categorized ranks with associated famous athletes and XP thresholds
const rankCategories = [
    {
        category: 'Einsteiger',
        ranks: [
            { id: 'rookie', name: 'Rookie', xp: 0, athlete: 'Kilian Jornet', icon: '🏔️' },
            { id: 'trainee', name: 'Trainee', xp: 10, athlete: 'Nick Bare', icon: '💪' }
        ]
    },
    {
        category: 'Fortgeschritten',
        ranks: [
            { id: 'grinder', name: 'Grinder', xp: 25, athlete: 'Hafþór Björnsson', icon: '🪨' },
            { id: 'ironwill', name: 'Iron Will', xp: 45, athlete: 'Eddie Hall', icon: '🏋️' },
            { id: 'beastmode', name: 'Beast Mode', xp: 70, athlete: 'Rich Froning', icon: '🔥' }
        ]
    },
    {
        category: 'Profi',
        ranks: [
            { id: 'champion', name: 'Champion', xp: 100, athlete: 'Ronnie Coleman', icon: '🏆' },
            { id: 'warrior', name: 'Warrior', xp: 140, athlete: 'Arda Stacci', icon: '⚔️' },
            { id: 'relentless', name: 'Relentless', xp: 190, athlete: 'Cristiano Ronaldo', icon: '⚽' }
        ]
    },
    {
        category: 'Absolute Elite',
        ranks: [
            { id: 'legend', name: 'Legend', xp: 250, athlete: 'Kobe Bryant', icon: '🏀' },
            { id: 'unstoppable', name: 'Unstoppable', xp: 320, athlete: 'Michael Jordan', icon: '🔥' },
            { id: 'canthurtme', name: "Can't Hurt Me", xp: 400, athlete: 'David Goggins', icon: '🛡️' }
        ]
    }
];

// Flattened ranks list for quick lookups
const ranks = rankCategories.reduce((acc, cat) => acc.concat(cat.ranks), []);

// Athlete metadata: achievements and motivational quote
const athletes = {
    'Kilian Jornet': { achievements: ['Multiple Skyrunner World Series wins', 'Ultra trail records'], quote: 'You learn more from failure than success.' },
    'Nick Bare': { achievements: ['Founder Bare Performance', 'Multiple endurance events'], quote: 'Consistency builds champions.' },
    'Hafþór Björnsson': { achievements: ['World\'s Strongest Man 2018', 'Strongman records'], quote: 'Strength begins with the mind.' },
    'Eddie Hall': { achievements: ['World\'s Strongest Man 2017', 'Deadlift records'], quote: 'Hard work beats talent when talent doesn\'t work hard.' },
    'Rich Froning': { achievements: ['4x CrossFit Games Champion', 'Functional fitness legend'], quote: 'It\'s not about being the best; it\'s about doing your best.' },
    'Ronnie Coleman': { achievements: ['8x Mr. Olympia', 'Bodybuilding icon'], quote: 'Ain\'t nothin\' to it but to do it.' },
    'Arda Stacci': { achievements: ['Professional athlete', 'Notable competitor'], quote: 'Push limits, earn results.' },
    'Cristiano Ronaldo': { achievements: ['5x Ballon d\'Or nominee', 'All-time leading scorer for clubs'], quote: 'Dedication gives you the passion to reach your dreams.' },
    'Kobe Bryant': { achievements: ['5x NBA Champion', 'Hall of Fame'], quote: 'The most important thing is to try and inspire people so that they can be great at whatever they want to do.' },
    'Michael Jordan': { achievements: ['6x NBA Champion', 'Basketball GOAT'], quote: 'I can accept failure, everyone fails at something. But I can\'t accept not trying.' },
    'David Goggins': { achievements: ['Ultra-endurance athlete', 'Author of Can\'t Hurt Me'], quote: 'Suffering is a test.' }
};

// Map athlete display names to image files placed in /athletes
const athleteImageMap = {
    'Kilian Jornet': 'athletes/kilian_jornet.png',
    'Nick Bare': 'athletes/Nick_Bare.png',
    'Hafþór Björnsson': 'athletes/Hafthor_Björnsson.png',
    'Hafthor Björnsson': 'athletes/Hafthor_Björnsson.png',
    'Eddie Hall': 'athletes/Eddie_Hall.png',
    'Rich Froning': 'athletes/Rich_Froning.png',
    'Ronnie Coleman': 'athletes/Ronnie_Coleman.png',
    'Arda Stacci': 'athletes/Arda_Stacci.png',
    'Cristiano Ronaldo': 'athletes/Cristiano_Ronaldo.png',
    'Kobe Bryant': 'athletes/Kobe_Bryant.png',
    'Michael Jordan': 'athletes/Michael_Jordan.png',
    'David Goggins': 'athletes/David_Goggins.png'
};

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


function init() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log("Service Worker: Aktiv"))
            .catch(err => console.error("Service Worker: Fehler", err));
    }

    displayGreeting();
    displayRandomQuote();
    checkDayChange();
    calculateStreak();
    calculateTotalXP();
    renderRankSystem();
    
    const savedDark = localStorage.getItem('darkMode') === 'true';
    if (savedDark) {
        document.body.classList.add('dark-mode');
    }
    updateThemeIcon(savedDark);
    
    updateNotificationIcon();
    
    saveAndRender();
    loadScheduled();
    scheduleAllReminders();
    scheduleNextNotification(); 

    const list = document.getElementById('habitList');
    if (list) {
        new Sortable(list, {
            handle: '.drag-handle', 
            animation: 150, 
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                const newOrderIds = Array.from(list.children).map(li => parseInt(li.getAttribute('data-id')));
                const visibleHabits = newOrderIds.map(id => habits.find(h => h.id === id));
                const hiddenHabits = habits.filter(h => !newOrderIds.includes(h.id));
                habits = [...visibleHabits, ...hiddenHabits];
                localStorage.setItem('habits', JSON.stringify(habits));
            }
        });
    }

    setInterval(() => {
        const now = Date.now();
        let needsRender = false;
        habits.forEach(h => {
            if (h.timerActive && h.timerEndTime) {
                if (now >= h.timerEndTime) {
                    h.completed = true;
                    h.timerActive = false;
                    h.timeLeft = 0;
                    h.timerEndTime = null;
                    playSound('success');
                    checkConfetti();
                }
                needsRender = true;
            }
        });
        if (needsRender) saveAndRender();
    }, 1000);

    // Ensure navbar shows only emojis (in case HTML was not updated or cached)
    try {
        const navMap = {
            navTodo: '📝',
            navCalendar: '📊',
            navPlanner: '📅',
            navRank: '🏆'
        };
        Object.keys(navMap).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = navMap[id];
        });
    } catch (e) { /* silent */ }
}


function updateNotificationIcon() {
    const btn = document.getElementById('notificationBtn');
    if (!btn) return;

    const isEnabled = localStorage.getItem('notificationsActive') === 'true';
    const permission = Notification.permission;

    if (permission === "granted" && isEnabled) {
        btn.innerText = '🔔'; 
        btn.style.color = "#4caf50"; 
        btn.style.opacity = "1";
    } else if (permission === "granted" && !isEnabled) {
        btn.innerText = '🔕'; 
        btn.style.color = "gray"; 
        btn.style.opacity = "0.6";
    } else if (permission === "denied") {
        btn.innerText = '🔕'; 
        btn.style.color = "#ff4c4c"; 
        btn.style.opacity = "1";
    } else {
        btn.innerText = '🔔';
        btn.style.color = "gray";
        btn.style.opacity = "0.5";
    }
}

function requestNotificationPermission() {
    if (!("Notification" in window)) return;

    const isEnabled = localStorage.getItem('notificationsActive') === 'true';

    if (Notification.permission === "granted" && isEnabled) {
        localStorage.setItem('notificationsActive', 'false');
        updateNotificationIcon();
        if (notificationTimeoutId) clearTimeout(notificationTimeoutId);
        showCustomAlert("Benachrichtigungen pausiert. 🔇");
        return;
    }

    if (Notification.permission === "granted" && !isEnabled) {
        localStorage.setItem('notificationsActive', 'true');
        updateNotificationIcon();
        new Notification("Wieder aktiv! 🔔", { body: "Du wirst jetzt wieder erinnert." });
        scheduleNextNotification();
        scheduleAllReminders();
        return;
    }

    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            localStorage.setItem('notificationsActive', 'true');
            new Notification("Habit Tracker", { body: "Erinnerungen sind jetzt aktiv! 🔔" });
            scheduleNextNotification();
            scheduleAllReminders();
        } else if (permission === "denied") {
            showCustomAlert("Benachrichtigungen sind im Browser blockiert.");
        }
        updateNotificationIcon();
    });
}

function scheduleNextNotification() {
    if (notificationTimeoutId) clearTimeout(notificationTimeoutId);

    const isEnabled = localStorage.getItem('notificationsActive') === 'true';
    if (!isEnabled || Notification.permission !== "granted") {
        console.log("Benachrichtigungen sind deaktiviert. Keine Planung.");
        return;
    }

    const now = new Date();
    let notificationTime = new Date();
    
    const NOTIFICATION_HOUR = 19;
    notificationTime.setHours(NOTIFICATION_HOUR, 0, 0, 0);

    if (now > notificationTime) {
        notificationTime.setDate(notificationTime.getDate() + 1);
    }

    const delay = notificationTime.getTime() - now.getTime();
    
    console.log(`Nächste Benachrichtigungs-Prüfung geplant für: ${notificationTime.toLocaleString()}`);

    notificationTimeoutId = setTimeout(() => {
        triggerReminderNotification();
        scheduleNextNotification(); 
    }, delay);
}

/* Reminder scheduling for per-habit times */
function clearScheduledTimers() {
    Object.values(scheduledTimers).forEach(id => clearTimeout(id));
    scheduledTimers = {};
}

function computeNextDateForHabit(habit, timeStr, fromDate = new Date(), specificDateKey = null) {
    // timeStr: 'HH:MM'
    const [hh, mm] = (timeStr || '00:00').split(':').map(n => parseInt(n));
    let candidate = new Date(fromDate.getTime());
    candidate.setHours(hh, mm, 0, 0);

    if (specificDateKey) {
        const parts = specificDateKey.split('.'); // DD.MM.YYYY
        if (parts.length === 3) {
            candidate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), hh, mm, 0, 0);
            return candidate;
        }
    }

    if (candidate > new Date()) return candidate;

    // find next matching day according to habit.days
    const days = habit.days || [];
    if (days.includes('all') || days.length === 0) {
        candidate.setDate(candidate.getDate() + 1);
        return candidate;
    }

    // days are strings like '1'..'6' and '0' for Sunday
    for (let i = 1; i <= 7; i++) {
        const d = new Date(); d.setDate(d.getDate() + i);
        const dayNum = d.getDay().toString();
        if (days.includes(dayNum)) {
            d.setHours(hh, mm, 0, 0);
            return d;
        }
    }
    // fallback: next day
    candidate.setDate(candidate.getDate() + 1);
    return candidate;
}

function scheduleNotificationForHabit(habit, specificDateKey = null) {
    if (!('Notification' in window)) return;
    const enabled = localStorage.getItem('notificationsActive') === 'true' && Notification.permission === 'granted';
    if (!enabled) return;
    if (!habit.reminderTime) return;

    const next = computeNextDateForHabit(habit, habit.reminderTime, new Date(), specificDateKey);
    const now = new Date();
    const delay = next.getTime() - now.getTime();
    if (delay <= 0) return;

    const key = habit.id + (specificDateKey ? '::' + specificDateKey : '');
    if (scheduledTimers[key]) clearTimeout(scheduledTimers[key]);

    scheduledTimers[key] = setTimeout(() => {
        new Notification(habit.text, { body: 'Erinnerung: ' + habit.text, icon: './icon-192.png', tag: 'habit-' + habit.id });
        // if one-off for a specific date, don't reschedule
        if (specificDateKey || habit.oneOff) {
            // no reschedule
        } else {
            // schedule next occurrence
            scheduleNotificationForHabit(habit);
        }
    }, delay);
}

function scheduleAllReminders() {
    clearScheduledTimers();
    // schedule recurring and normal habit reminders
    habits.forEach(h => {
        if (h.reminderTime) {
            if (h.oneOff) {
                // find dates in scheduledHabits referencing this id
                Object.keys(scheduledHabits).forEach(dateKey => {
                    const arr = scheduledHabits[dateKey] || [];
                    if (arr.includes(h.id)) {
                        scheduleNotificationForHabit(h, dateKey);
                    }
                });
            } else {
                scheduleNotificationForHabit(h);
            }
        }
    });
}

function triggerReminderNotification() {
    const openHabits = getHabitsForDayNum(new Date().getDay()).filter(h => !h.completed).length;

    if (openHabits > 0) {
        new Notification("Dranbleiben! 💪", {
            body: `Du hast heute noch ${openHabits} offene Ziele. Du schaffst das!`,
            icon: './icon-192.png',
            tag: 'daily-reminder' 
        });
    }
}

function calculateStreak() {
    let currentStreak = 0;
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

function calculateTotalXP() {
    totalXP = history.filter(entry => entry.percentage === 100).length;
    localStorage.setItem('totalXP', totalXP);
}

function getRankIndex(xp) {
    for (let i = ranks.length - 1; i >= 0; i--) {
        if (xp >= ranks[i].xp) return i;
    }
    return 0;
}

function updateThemeIcon(isDark) {
    const btn = document.getElementById('darkModeToggle');
    if (btn) btn.innerText = isDark ? '☀️' : '🌙';
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark);
    updateThemeIcon(isDark);

    const metaThemeColor = document.getElementById("themeMeta");
    if (metaThemeColor) {
        metaThemeColor.setAttribute("content", isDark ? "#121212" : "#f0f2f5");
    }
}

function displayGreeting() {
    const greetingEl = document.getElementById('greeting');
    if (!greetingEl) return;

    const hour = new Date().getHours();
    let greetingText = '';

    if (hour >= 5 && hour < 12) {
        greetingText = 'Guten Morgen! ☀️';
    } else if (hour >= 12 && hour < 18) {
        greetingText = 'Schönen Nachmittag! 🌤️';
    } else {
        greetingText = 'Guten Abend! 🌙';
    }
    greetingEl.innerText = greetingText;
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

function toggleModalDay(dayStr) {
    if (dayStr === 'all') {
        modalSelectedDays = ['all'];
    } else {
        modalSelectedDays = modalSelectedDays.filter(d => d !== 'all');
        if (modalSelectedDays.includes(dayStr)) {
            modalSelectedDays = modalSelectedDays.filter(d => d !== dayStr);
        } else {
            modalSelectedDays.push(dayStr);
        }
        if (modalSelectedDays.length === 0) modalSelectedDays = ['all'];
    }
    document.querySelectorAll('#modalDaySelector .day-btn').forEach(btn => {
        const d = btn.getAttribute('data-day');
        btn.classList.toggle('active', modalSelectedDays.includes(d));
    });
}

function setViewDay(dayStr) {
    viewingDay = dayStr;
    
    document.querySelectorAll('#viewDaySelector .day-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-day') === dayStr);
    });

    saveAndRender();
}

function resetModalDaySelector() {
    modalSelectedDays = ['all'];
    document.querySelectorAll('#modalDaySelector .day-btn').forEach(btn => {
        const d = btn.getAttribute('data-day');
        btn.classList.toggle('active', d === 'all');
    });
}


function getHabitsForDayNum(dayNum) {
    const todayKey = formatDateKey(new Date());
    const isToday = dayNum === new Date().getDay();
    const result = [];

    habits.forEach(h => {
        const days = h.days || [];
        if (days.includes('all')) { result.push(h); return; }
        if (days.includes(dayNum.toString())) { result.push(h); return; }
        if (isToday && days.includes(todayKey)) { result.push(h); return; }
    });

    if (isToday) {
        const assigned = scheduledHabits[todayKey] || [];
        assigned.forEach(id => {
            const h = habits.find(x => x.id === id);
            if (h && !result.includes(h)) result.push(h);
        });
    }

    return result;
}

function checkDayChange() {
    const today = new Date().toLocaleDateString('de-DE');
    if (lastDate !== today) {
        const alreadySaved = history.find(entry => entry.date === lastDate);

        if (habits.length > 0 && !alreadySaved) {
            let yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            saveToHistory(lastDate, yesterday.getDay());
        }

        lastDate = today;
        localStorage.setItem('lastDate', lastDate);
        habits = habits.map(h => ({ 
            ...h, 
            completed: false, 
            timeLeft: h.duration * 60, 
            timerActive: false,
            timerEndTime: null 
        }));
        calculateStreak();
    }
}

function finishDay() {
    document.getElementById('confirmModal').classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
}

function executeFinishDay() {
    const note = document.getElementById('dayNote').value;
    
    const oldXP = totalXP;
    const oldRankIndex = getRankIndex(oldXP);

    saveToHistory(new Date().toLocaleDateString('de-DE'), new Date().getDay(), note, currentDifficulty);
    calculateTotalXP();
    
    habits = habits.map(h => ({ 
        ...h, 
        completed: false, 
        timeLeft: h.duration * 60, 
        timerActive: false,
        timerEndTime: null
    }));
    calculateStreak();
    saveAndRender();
    
    document.getElementById('dayNote').value = '';
    closeConfirmModal();
    showPage('calendar');
    renderRankSystem();
    
    const newRankIndex = getRankIndex(totalXP);
    
    if (newRankIndex > oldRankIndex) {
        playSound('levelup');
        const newRank = ranks[newRankIndex];
        showRankUpScreen(newRank);
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

    // Build activity-level breakdown: name + category + count
    const activityMap = {};
    completed.forEach(h => {
        const key = h.text || 'Unbenannt';
        if (!activityMap[key]) activityMap[key] = { name: key, category: h.category || 'alltag', count: 0 };
        activityMap[key].count += 1;
    });
    const activities = Object.values(activityMap);

    history.unshift({ 
        date: dateStr, 
        percentage: perc, 
        stats: stats, 
        activities: activities, 
        note: note, 
        difficulty: diff 
    });
    localStorage.setItem('habitHistory', JSON.stringify(history));
}

function openAddModal() {
    document.getElementById('addHabitModal').classList.remove('hidden');
    resetModalDaySelector();
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
    
    const duration = parseInt(durInput.value) || 0;

    const timeVal = document.getElementById('modalTimeInput') ? document.getElementById('modalTimeInput').value : '';

    habits.push({ 
        id: Date.now(), 
        text: input.value, 
        category: cat.value, 
        completed: false,
        days: [...modalSelectedDays],
        reminderTime: timeVal || null,
        duration: duration, 
        timeLeft: duration * 60, 
        timerActive: false,
        timerEndTime: null 
    });
    
    input.value = '';
    durInput.value = '';
    closeAddModal();
    saveAndRender();
    scheduleAllReminders();
}

function toggleHabit(id) {
    let newlyDone = false;
    habits = habits.map(h => {
        if (h.id === id) {
            if (!h.completed) newlyDone = true;
            if (h.timerActive) {
                return { ...h, completed: !h.completed, timerActive: false, timerEndTime: null, timeLeft: 0 };
            }
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
            const now = Date.now();
            if (!h.timerActive) {
                if (h.timeLeft <= 0) {
                    h.timeLeft = h.duration * 60;
                    h.completed = false;
                }
                return { 
                    ...h, 
                    timerActive: true,
                    timerEndTime: now + (h.timeLeft * 1000)
                };
            } 
            else {
                const newTimeLeft = Math.max(0, Math.round((h.timerEndTime - now) / 1000));
                return {
                    ...h,
                    timerActive: false,
                    timerEndTime: null,
                    timeLeft: newTimeLeft
                };
            }
        }
        return h;
    });
    saveAndRender();
}

function deleteHabit(id, btnElement) {
    const li = btnElement.closest('li');
    li.classList.add('slide-out');

    setTimeout(() => {
        const habitToDelete = habits.find(h => h.id === id);
        if (habitToDelete) {
            deletedHabitBackup = habitToDelete;
            showUndoToast();
        }
        
        habits = habits.filter(h => h.id !== id);
        // remove scheduled references
        Object.keys(scheduledHabits).forEach(dateKey => {
            scheduledHabits[dateKey] = (scheduledHabits[dateKey] || []).filter(x => x !== id);
            if (scheduledHabits[dateKey] && scheduledHabits[dateKey].length === 0) delete scheduledHabits[dateKey];
        });
        saveScheduled();
        saveAndRender();
        scheduleAllReminders();
    }, 400);
}

function showUndoToast() {
    const toast = document.getElementById('undoToast');
    toast.classList.remove('hidden');
    
    if (undoTimeout) clearTimeout(undoTimeout);
    
    undoTimeout = setTimeout(() => {
        toast.classList.add('hidden');
        deletedHabitBackup = null;
    }, 5000);
}

function undoDelete() {
    if (deletedHabitBackup) {
        habits.push(deletedHabitBackup);
        habits.sort((a, b) => a.id - b.id);
        saveAndRender();
        
        document.getElementById('undoToast').classList.add('hidden');
        deletedHabitBackup = null;
        clearTimeout(undoTimeout);
        scheduleAllReminders();
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

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function saveAndRender() {
    localStorage.setItem('habits', JSON.stringify(habits));
    const list = document.getElementById('habitList');
    if (!list) return;
    
    list.innerHTML = '';
    
    let dayNumToShow;
    const isTodayView = (viewingDay === 'today');
    if (isTodayView) {
        dayNumToShow = new Date().getDay();
    } else {
        dayNumToShow = parseInt(viewingDay);
    }
    const todayHabits = getHabitsForDayNum(dayNumToShow);

    const finishBtn = document.getElementById('finishDayBtn');
    if (finishBtn) finishBtn.style.display = isTodayView ? 'block' : 'none';

    if (todayHabits.length === 0) {
        list.innerHTML = `<p style="text-align:center; opacity:0.6; margin-top:20px;">Für diesen Tag sind keine Ziele geplant. 🗓️</p>`;
    }

    todayHabits.forEach(h => {
        const li = document.createElement('li');
        li.className = `cat-${h.category} ${h.completed ? 'completed' : ''}`;
        li.setAttribute('data-id', h.id);
        
        let timerHtml = '';
        const timerDisabled = !isTodayView ? 'disabled' : '';
        if (h.duration > 0) {
            const icon = h.timerActive ? '⏸️' : '▶️';
            let displayTime = h.timeLeft;
            if (h.timerActive && h.timerEndTime) {
                displayTime = Math.max(0, Math.round((h.timerEndTime - Date.now()) / 1000));
            }
            
            timerHtml = `<span class="timer-badge">
                            <button class="timer-btn" onclick="toggleTimer(${h.id}); event.stopPropagation();" ${timerDisabled}>${icon}</button>
                            ${formatTime(displayTime)}
                         </span>`;
        }

        const checkboxDisabled = !isTodayView ? 'disabled' : '';

        const timeBadgeHtml = h.reminderTime ? `<button class="time-edit-btn" onclick="openTimeModal(${h.id}); event.stopPropagation();">⏰</button><span class="time-badge">${h.reminderTime}</span>` : '';

        li.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span class="drag-handle">⋮⋮</span>
                <input type="checkbox" ${h.completed ? 'checked' : ''} onchange="toggleHabit(${h.id})" ${checkboxDisabled}>
                <span onclick="editHabit(${h.id})" style="cursor:pointer;">${h.text}</span>
                ${timerHtml}
                ${timeBadgeHtml}
            </div>
            <button onclick="deleteHabit(${h.id}, this)" style="border:none; background:none; color:#ff4c4c; cursor:pointer; padding:5px;">✕</button>`;

        let touchStartX = 0;
        let touchCurrentX = 0;

        li.addEventListener('touchstart', (e) => {
            if (e.target.classList.contains('drag-handle')) return;

            touchStartX = e.touches[0].clientX;
            touchCurrentX = touchStartX;
            li.style.transition = 'none';
        }, {passive: true});

        li.addEventListener('touchmove', (e) => {
            touchCurrentX = e.touches[0].clientX;
            const diff = touchCurrentX - touchStartX;
            
            if (diff < 0) {
                li.style.transform = `translateX(${diff}px)`;
                li.style.opacity = Math.max(0.5, 1 - Math.abs(diff) / 200);
            }
        }, {passive: true});

        li.addEventListener('touchend', () => {
            const diff = touchCurrentX - touchStartX;
            li.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            
            if (diff < -100) { 
                li.style.transform = 'translateX(-100%)'; 
                li.style.opacity = '0';
                setTimeout(() => {
                    habits = habits.filter(item => item.id !== h.id); 
                    saveAndRender();
                }, 300);
            } else {
                li.style.transform = 'translateX(0)';
                li.style.opacity = '1';
            }
        });

        list.appendChild(li);
    });
    updateProgress();
}

function renderRankSystem() {
    // Flatten ranks for progress computation
    const flat = [];
    rankCategories.forEach(cat => {
        cat.ranks.forEach(r => flat.push({ ...r, category: cat.category }));
    });

    let currentRank = flat[0];
    let nextRank = flat[1] || null;
    for (let i = flat.length - 1; i >= 0; i--) {
        if (totalXP >= flat[i].xp) {
            currentRank = flat[i];
            nextRank = flat[i + 1] || null;
            break;
        }
    }

    let progress = 0;
    if (nextRank) {
        const xpInThisRank = totalXP - currentRank.xp;
        const xpNeededForRank = nextRank.xp - currentRank.xp;
        progress = xpNeededForRank > 0 ? (xpInThisRank / xpNeededForRank) * 100 : 100;
    } else {
        progress = 100;
    }

    const iconEl = document.getElementById('rankIconLarge');
    const nameEl = document.getElementById('rankNameLarge');
    const infoEl = document.getElementById('rankInfoLarge');
    const barEl = document.getElementById('rankProgressBarLarge');

    if(iconEl) {
        const bigImg = athleteImageMap[currentRank.athlete];
        if (bigImg) iconEl.innerHTML = `<img src="${bigImg}" alt="${currentRank.athlete}" class="rank-icon-img">`;
        else iconEl.innerText = currentRank.icon || '';
    }
    if(nameEl) nameEl.innerText = `${currentRank.name} — ${currentRank.athlete}`;
    if(infoEl) infoEl.innerText = nextRank ? `${totalXP} / ${nextRank.xp} XP` : `${totalXP} XP (Max)`;
    // clamp progress and guard NaN
    progress = isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
    if(barEl) barEl.style.width = progress + '%';
    // show percent next to bar
    const infoPercentId = 'rankProgressPercent';
    let pctEl = document.getElementById(infoPercentId);
    if (!pctEl) {
        pctEl = document.createElement('div');
        pctEl.id = infoPercentId;
        pctEl.style.marginTop = '6px';
        pctEl.style.fontSize = '0.9rem';
        pctEl.style.opacity = '0.85';
        document.querySelector('.rank-card').appendChild(pctEl);
    }
    pctEl.innerText = `Fortschritt: ${Math.round(progress)}% bis zum nächsten Rang`;

    const timelineContainer = document.getElementById('rankTimeline');
    if(timelineContainer) {
        timelineContainer.innerHTML = '';
        rankCategories.forEach(cat => {
            const header = document.createElement('div');
            header.className = 'rank-category';
            header.innerText = cat.category;
            timelineContainer.appendChild(header);

            cat.ranks.forEach(r => {
                const isUnlocked = totalXP >= r.xp;
                const isCurrent = r.id === currentRank.id;
                const div = document.createElement('div');
                div.className = `timeline-item ${isUnlocked ? 'unlocked' : ''} ${isCurrent ? 'current' : ''}`;
                const imgPath = athleteImageMap[r.athlete];
                const iconHtml = imgPath ? `<img src="${imgPath}" alt="${r.athlete}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;">` : `<span class="timeline-icon" style="font-size:1.6rem;">${r.icon || '⭐'}</span>`;
                div.innerHTML = `
                    ${iconHtml}
                    <div class="timeline-info">
                        <div style="font-weight:bold;">${r.name}</div>
                        <div style="font-size:0.8rem; opacity:0.7;">${r.athlete} • ${r.xp} XP</div>
                    </div>
                    ${isUnlocked ? '✅' : '🔒'}
                `;
                div.style.cursor = 'pointer';
                div.onclick = () => openAthleteDetail(r.athlete);
                timelineContainer.appendChild(div);
            });
        });
    }
}

function openAthleteDetail(name) {
    const meta = athletes[name] || { achievements: [], quote: '' };
    const imgPath = athleteImageMap[name];
    if (imgPath) {
        document.getElementById('athleteIcon').innerHTML = `<img src="${imgPath}" alt="${name}" class="athlete-modal-img">`;
    } else {
        document.getElementById('athleteIcon').innerText = getAthleteIcon(name) || '';
    }
    document.getElementById('athleteName').innerText = name;
    document.getElementById('athleteTagline').innerText = '';
    const ul = document.getElementById('athleteAchievements');
    ul.innerHTML = '';
    (meta.achievements || []).forEach(a => {
        const li = document.createElement('li'); li.className = 'athlete-achievement'; li.innerText = a; ul.appendChild(li);
    });
    document.getElementById('athleteQuote').innerText = meta.quote || '';
    document.getElementById('athleteModal').classList.remove('hidden');
}

function closeAthleteModal() { document.getElementById('athleteModal').classList.add('hidden'); }

function getAthleteIcon(name) {
    // try to find icon from rankCategories
    for (const cat of rankCategories) {
        for (const r of cat.ranks) {
            if (r.athlete === name) return r.icon || '';
        }
    }
    return '';
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


function showPage(pageId) {
    document.getElementById('todoPage').classList.toggle('hidden', pageId !== 'todo');
    document.getElementById('calendarPage').classList.toggle('hidden', pageId !== 'calendar');
    document.getElementById('plannerPage').classList.toggle('hidden', pageId !== 'planner');
    document.getElementById('rankPage').classList.toggle('hidden', pageId !== 'rank');
    
    document.getElementById('navTodo').classList.toggle('active', pageId === 'todo');
    document.getElementById('navCalendar').classList.toggle('active', pageId === 'calendar');
    const navPlanner = document.getElementById('navPlanner');
    if (navPlanner) navPlanner.classList.toggle('active', pageId === 'planner');
    document.getElementById('navRank').classList.toggle('active', pageId === 'rank');
    
    
    const titles = { 'todo': 'Tages-Ziele', 'calendar': 'Statistik', 'planner': 'Kalender', 'rank': 'Rangliste' };
    document.getElementById('pageTitle').innerText = titles[pageId] || 'Habit Tracker';
    
    if (pageId === 'calendar') {
        renderHistory();
        updateStats();
        setTimeout(renderTrendChart, 50);
    }

    if (pageId === 'planner') {
        renderCalendar();
    }
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    const MAX_HISTORY_DISPLAY = window.historyDisplayLimit || 30;
    list.innerHTML = history.length === 0 ? '<p style="text-align:center; opacity:0.5;">Noch kein Verlauf gespeichert.</p>' : '';

    const toShow = history.slice(0, MAX_HISTORY_DISPLAY);

    toShow.forEach((entry, i) => {
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

    if (history.length > MAX_HISTORY_DISPLAY) {
        const more = document.createElement('div');
        more.style.textAlign = 'center';
        more.style.marginTop = '8px';
        more.innerHTML = `<button class="btn-secondary" onclick="showMoreHistory()">Weitere ${history.length - MAX_HISTORY_DISPLAY} anzeigen</button>`;
        list.appendChild(more);
    }
}

function showMoreHistory() {
    window.historyDisplayLimit = history.length;
    renderHistory();
}


function openDetail(index) {
    const entry = history[index];
    if (!entry.stats) return showCustomAlert("Keine Detaildaten verfügbar.");
    document.getElementById('detailModal').classList.remove('hidden');
    document.getElementById('modalDate').innerText = entry.date;
    
    const diffEmojis = ["😊 Leicht", "😐 Okay", "😫 Schwer"];
    const diffText = entry.difficulty ? diffEmojis[entry.difficulty - 1] : "Keine Info";
    
    const isDarkMode = document.body.classList.contains('dark-mode');
    const noteBg = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    document.getElementById('modalStatsText').innerHTML = `
        <div style="text-align: left; margin-top: 10px;">
            <p><strong>Erfolg:</strong> ${entry.percentage}% | <strong>Gefühl:</strong> ${diffText}</p>
            <p style="font-style: italic; background: ${noteBg}; padding: 10px; border-radius: 8px;">
                "${entry.note || 'Keine Notiz vorhanden.'}"
            </p>
        </div>
    `;
    
    const ctx = document.getElementById('detailChart').getContext('2d');
    if (detailChart) detailChart.destroy();
    // If activity-level data exists, prefer that. Otherwise fall back to category stats.
    let labels = [];
    let dataPoints = [];
    let background = [];
    const categoryColors = { sport: '#ff9800', lernen: '#2196f3', gesundheit: '#4caf50', alltag: '#9e9e9e' };

    if (entry.activities && entry.activities.length > 0) {
        labels = entry.activities.map(a => a.name);
        dataPoints = entry.activities.map(a => a.count);
        background = entry.activities.map(a => categoryColors[a.category] || '#9e9e9e');
    } else {
        labels = ['Sport', 'Lernen', 'Gesund', 'Alltag'];
        dataPoints = [entry.stats.sport, entry.stats.lernen, entry.stats.gesundheit, entry.stats.alltag];
        background = ['#ff9800', '#2196f3', '#4caf50', '#9e9e9e'];
    }

    detailChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{ 
                data: dataPoints,
                backgroundColor: background,
                borderColor: isDarkMode ? '#1e1e1e' : '#fff',
                borderWidth: 2
            }]
        },
        options: { plugins: { legend: { position: 'bottom', labels: { color: isDarkMode ? '#fff' : '#333' } } } }
    });
}

function setDifficulty(level) {
    currentDifficulty = level;
    
    const btn1 = document.getElementById('diff1');
    const btn2 = document.getElementById('diff2');
    const btn3 = document.getElementById('diff3');
    const allBtns = [btn1, btn2, btn3];

    allBtns.forEach(btn => {
        if (btn) {
            btn.classList.remove('active-easy', 'active-medium', 'active-hard', 'active');
        }
    });

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
    
    
    let sortedHistory = [...history].sort((a, b) => {
        const partsA = a.date.split('.'); 
        const partsB = b.date.split('.');
        if(partsA.length < 2 || partsB.length < 2) return 0;
        const dateA = new Date(partsA[2], partsA[1] - 1, partsA[0]);
        const dateB = new Date(partsB[2], partsB[1] - 1, partsB[0]);
        return dateA - dateB;
    });

    let lastSeven = sortedHistory.slice(-7);

    
    if (lastSeven.length === 1) {
        lastSeven.unshift({ date: "Start", percentage: 0 });
    }

    const labels = lastSeven.map(entry => {
        if (entry.date === "Start") return "Start";
        const parts = entry.date.split('.');
        return `${parts[0]}.${parts[1]}.`;
    });
    const dataPoints = lastSeven.map(entry => entry.percentage);

    if (trendChart !== null) {
        trendChart.destroy();
    }

    const isDarkMode = document.body.classList.contains('dark-mode');
    let lineColor = '#4caf50'; 
    if (dataPoints.length >= 2 && dataPoints[dataPoints.length - 1] < dataPoints[0]) {
        lineColor = '#f44336'; 
    }

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
                    pointRadius: 5,
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

    const lastSeven = history.slice(0, 7);
    const avg = Math.round(lastSeven.reduce((sum, entry) => sum + entry.percentage, 0) / lastSeven.length);
    document.getElementById('statAverage').innerText = avg + "%";

    const best = Math.max(...history.map(entry => entry.percentage));
    document.getElementById('statBest').innerText = best + "%";
    
    document.getElementById('statAverage').style.color = avg >= 80 ? '#4caf50' : '#ff9800';
}

function formatDateKey(date) {
    return date.toLocaleDateString('de-DE');
}

function loadScheduled() {
    scheduledHabits = JSON.parse(localStorage.getItem('scheduledHabits')) || {};
}

function saveScheduled() {
    localStorage.setItem('scheduledHabits', JSON.stringify(scheduledHabits));
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('calendarMonthLabel');
    if (!grid || !label) return;

    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    label.innerText = `${monthNames[month]} ${year}`;

    grid.innerHTML = '';

    const weekdays = ['Mo','Di','Mi','Do','Fr','Sa','So'];
    weekdays.forEach(w => {
        const el = document.createElement('div');
        el.className = 'calendar-weekday';
        el.innerText = w;
        grid.appendChild(el);
    });

    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const daysInMonth = last.getDate();

    // JS: 0=Sun, make Monday start
    const startOffset = (first.getDay() + 6) % 7; 

    // previous month's tail
    for (let i = 0; i < startOffset; i++) {
        const d = new Date(year, month, i - startOffset + 1);
        const dv = d.getDate();
        const dateStr = formatDateKey(d);
        const cell = document.createElement('div');
        cell.className = 'calendar-day outside';
        cell.innerHTML = `<div class="date-num">${dv}</div>`;
        grid.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const cur = new Date(year, month, d);
        const dateStr = formatDateKey(cur);
        const cell = document.createElement('div');
        cell.className = 'calendar-day' + (dateStr === formatDateKey(new Date()) ? ' today' : '');
        cell.setAttribute('data-date', dateStr);
        const assigned = scheduledHabits[dateStr] || [];
        cell.innerHTML = `<div class="date-num">${d}</div>` + (assigned.length ? `<div class="assign-count">${assigned.length} geplant</div>` : '');
        cell.onclick = () => openCalendarDate(dateStr);
        grid.appendChild(cell);
    }

    // fill next month's leading days to complete the grid (optional)
    const totalCells = startOffset + daysInMonth;
    const remain = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remain; i++) {
        const d = new Date(year, month + 1, i);
        const cell = document.createElement('div');
        cell.className = 'calendar-day outside';
        cell.innerHTML = `<div class="date-num">${d.getDate()}</div>`;
        grid.appendChild(cell);
    }
}




function prevMonth() { calendarCursor.setMonth(calendarCursor.getMonth() - 1); renderCalendar(); }
function nextMonth() { calendarCursor.setMonth(calendarCursor.getMonth() + 1); renderCalendar(); }

function openCalendarDate(dateStr) {
    const modal = document.getElementById('calendarModal');
    if (!modal) return;
    document.getElementById('calendarModalDate').innerText = dateStr;
    modal.classList.remove('hidden');
    renderCalendarModalList(dateStr);
}

function closeCalendarModal() { document.getElementById('calendarModal').classList.add('hidden'); renderCalendar(); }

function renderCalendarModalList(dateStr) {
    const container = document.getElementById('calendarModalList');
    if (!container) return;
    container.innerHTML = '';

    const top = document.createElement('div');
    top.style.display = 'flex';
    top.style.gap = '8px';
    top.style.marginBottom = '10px';
    top.innerHTML = `<input id="calendarNewInput" placeholder="Neues Ziel für ${dateStr}" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-color);">
                     <button class="btn-primary" onclick="addOneOffHabit('${dateStr}')">Hinzufügen</button>`;
    container.appendChild(top);

    if (!habits || habits.length === 0) {
        const note = document.createElement('p');
        note.style.opacity = '0.7';
        note.innerText = 'Noch keine Ziele vorhanden. Erstelle zuerst ein Ziel in der Liste oder füge unten ein neues Ziel hinzu.';
        container.appendChild(note);
        return;
    }

    const assigned = scheduledHabits[dateStr] || [];
    habits.forEach(h => {
        const row = document.createElement('div');
        row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.justifyContent = 'space-between'; row.style.padding = '8px 0';
        const left = document.createElement('div');
        left.innerText = h.text;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = assigned.includes(h.id);
        cb.onchange = () => toggleScheduleHabit(h.id, dateStr);
        const timeBtn = document.createElement('button');
        timeBtn.className = 'time-edit-btn';
        timeBtn.innerText = '⏰';
        timeBtn.onclick = (e) => { e.stopPropagation(); openTimeModal(h.id, dateStr); };
        row.appendChild(left);
        row.appendChild(cb);
        row.appendChild(timeBtn);
        container.appendChild(row);
    });
}

function addOneOffHabit(dateStr) {
    const input = document.getElementById('calendarNewInput');
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    const id = Date.now();
    const newHabit = {
        id: id,
        text: text,
        category: 'alltag',
        completed: false,
        days: [],
        duration: 0,
        timeLeft: 0,
        timerActive: false,
        timerEndTime: null,
        oneOff: true
    };
    habits.push(newHabit);
    scheduledHabits[dateStr] = scheduledHabits[dateStr] || [];
    scheduledHabits[dateStr].push(id);
    saveScheduled();
    input.value = '';
    saveAndRender();
    scheduleAllReminders();
    renderCalendarModalList(dateStr);
}

function toggleScheduleHabit(habitId, dateStr) {
    scheduledHabits[dateStr] = scheduledHabits[dateStr] || [];
    const idx = scheduledHabits[dateStr].indexOf(habitId);
    if (idx === -1) scheduledHabits[dateStr].push(habitId);
    else scheduledHabits[dateStr].splice(idx, 1);
    saveScheduled();
    renderCalendarModalList(dateStr);
    renderCalendar();
    scheduleAllReminders();
}


function closeModal() {
    const modal = document.getElementById('detailModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}


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
    input.focus();
    promptCallback = callback;
}

function closeCustomPrompt() {
    document.getElementById('customPromptModal').classList.add('hidden');
    promptCallback = null;
}

let _timeModalState = null; // { habitId, dateKey }

function openTimeModal(habitId, dateKey = null) {
    _timeModalState = { habitId, dateKey };
    const habit = habits.find(h => h.id === habitId);
    const input = document.getElementById('timeModalInput');
    if (habit && habit.reminderTime) input.value = habit.reminderTime;
    else input.value = '';
    document.getElementById('timeModal').classList.remove('hidden');
}

function closeTimeModal() {
    document.getElementById('timeModal').classList.add('hidden');
    _timeModalState = null;
}

function confirmTimeModal() {
    const val = document.getElementById('timeModalInput').value;
    if (!_timeModalState) return closeTimeModal();
    const { habitId, dateKey } = _timeModalState;
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return closeTimeModal();
    habit.reminderTime = val || null;

    // if dateKey provided and habit not assigned, ensure assignment
    if (dateKey) {
        scheduledHabits[dateKey] = scheduledHabits[dateKey] || [];
        if (!scheduledHabits[dateKey].includes(habitId)) scheduledHabits[dateKey].push(habitId);
        saveScheduled();
    }

    saveAndRender();
    scheduleAllReminders();
    closeTimeModal();
}

function confirmCustomPrompt() {
    const val = document.getElementById('customPromptInput').value;
    if (promptCallback) {
        promptCallback(val);
    }
    closeCustomPrompt();
}

function openShareModal() {
    document.getElementById('shareModal').classList.remove('hidden');
}

function closeShareModal() {
    document.getElementById('shareModal').classList.add('hidden');
}

async function shareText() {
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

function playSound(type) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    if (type === 'success') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now); 
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); 
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5); 
        
        osc.start(now);
        osc.stop(now + 0.5);
    } 
    else if (type === 'levelup') {
        const notes = [523.25, 659.25, 783.99, 1046.50]; 
        
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.value = freq;
            
            const start = now + (i * 0.1);
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.1, start + 0.05);
            gain.gain.linearRampToValueAtTime(0, start + 0.4);
            
            osc.start(start);
            osc.stop(start + 0.4);
        });
    }
}


function showRankUpScreen(newRank) {
    const screen = document.getElementById('rankUpScreen');
    if (!screen) return;

    // Set rank info
    document.getElementById('rankUpRankName').innerText = newRank.name;
    document.getElementById('rankUpAthlete').innerText = newRank.athlete;
    document.getElementById('rankUpXP').innerText = `${totalXP} XP erreicht!`;
    
    // Set athlete image or icon
    const imgPath = athleteImageMap[newRank.athlete];
    const imageEl = document.getElementById('rankUpImage');
    if (imgPath) {
        imageEl.innerHTML = `<img src="${imgPath}" alt="${newRank.athlete}">`;
    } else {
        imageEl.innerText = newRank.icon || '⭐';
    }
    
    // Set motivational message based on rank
    const messages = {
        'rookie': 'Deine Reise beginnt! Bleib motiviert!',
        'trainee': 'Guter Start! Weiter geht\'s!',
        'grinder': 'Du wirst stärker! Lass nicht nach!',
        'ironwill': 'Großartig! Dein Wille ist unerschütterlich!',
        'beastmode': 'Beast Mode aktiviert! Du rockst!',
        'champion': 'Champion! Du bist unglaublich!',
        'warrior': 'Krieger! Du kämpfst für deine Ziele!',
        'relentless': 'Unaufhaltsam! Du bist eine Maschine!',
        'legend': 'Legende! Dein Name wird in Geschichte eingehen!',
        'unstoppable': 'Unaufhaltbar! Die Welt sollte Angst haben!',
        'canthurtme': 'You can\'t hurt me! Du bist auf Kobe/Michael Niveau!'
    };
    
    const message = messages[newRank.id] || 'Großartig! Bleib motiviert!';
    document.getElementById('rankUpMessage').innerText = message;
    
    // Show screen
    screen.classList.remove('hidden');
    
    // Auto-close after 5 seconds
    setTimeout(() => {
        if (!screen.classList.contains('hidden')) {
            closeRankUpScreen();
        }
    }, 5000);
}

function closeRankUpScreen() {
    const screen = document.getElementById('rankUpScreen');
    if (screen) {
        screen.classList.add('hidden');
    }
}

init();