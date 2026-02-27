
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
        return;
    }

    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            localStorage.setItem('notificationsActive', 'true');
            new Notification("Habit Tracker", { body: "Erinnerungen sind jetzt aktiv! 🔔" });
            scheduleNextNotification();
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
    return habits.filter(h => !h.days || h.days.includes('all') || h.days.includes(dayNum.toString()));
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

    history.unshift({ 
        date: dateStr, 
        percentage: perc, 
        stats: stats, 
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

    habits.push({ 
        id: Date.now(), 
        text: input.value, 
        category: cat.value, 
        completed: false,
        days: [...modalSelectedDays],
        duration: duration, 
        timeLeft: duration * 60, 
        timerActive: false,
        timerEndTime: null 
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
        saveAndRender();
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

        li.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span class="drag-handle">⋮⋮</span>
                <input type="checkbox" ${h.completed ? 'checked' : ''} onchange="toggleHabit(${h.id})" ${checkboxDisabled}>
                <span onclick="editHabit(${h.id})" style="cursor:pointer;">${h.text}</span>
                ${timerHtml}
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
    let currentRank = ranks[0];
    let nextRank = ranks[1];
    for (let i = ranks.length - 1; i >= 0; i--) {
        if (totalXP >= ranks[i].xp) {
            currentRank = ranks[i];
            nextRank = ranks[i + 1] || null;
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

    if(iconEl) iconEl.innerText = currentRank.icon;
    if(nameEl) nameEl.innerText = currentRank.name;
    if(infoEl) infoEl.innerText = nextRank ? `${totalXP} / ${nextRank.xp} XP` : `${totalXP} XP (Max)`;
    if(barEl) barEl.style.width = `${progress}%`;

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


function showPage(pageId) {
    document.getElementById('todoPage').classList.toggle('hidden', pageId !== 'todo');
    document.getElementById('calendarPage').classList.toggle('hidden', pageId !== 'calendar');
    document.getElementById('rankPage').classList.toggle('hidden', pageId !== 'rank');
    
    document.getElementById('navTodo').classList.toggle('active', pageId === 'todo');
    document.getElementById('navCalendar').classList.toggle('active', pageId === 'calendar');
    document.getElementById('navRank').classList.toggle('active', pageId === 'rank');
    
    
    const titles = { 'todo': 'Tages-Ziele', 'calendar': 'Statistik', 'rank': 'Rangliste' };
    document.getElementById('pageTitle').innerText = titles[pageId] || 'Habit Tracker';
    
    if (pageId === 'calendar') {
        renderHistory();
        updateStats();
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


function openDetail(index) {
    const entry = history[index];
    if (!entry.stats) return showCustomAlert("Keine Detaildaten verfügbar.");
    document.getElementById('detailModal').classList.remove('hidden');
    document.getElementById('modalDate').innerText = entry.date;
    
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


init();