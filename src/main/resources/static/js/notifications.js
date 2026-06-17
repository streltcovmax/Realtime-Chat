// notifications.js
'use strict';

// ============================================
// НАСТРОЙКИ
// ============================================

const NotificationSettings = {
    soundEnabled: true,
    browserEnabled: true,
    soundVolume: 0.5,
    // Путь к звуку (положи файл в static/sounds/)
    soundUrl: '/static/sounds/message.mp3'
};

const AVATAR_THEMES = [
    {background: '#4f8cff', color: '#071b3d'},
    {background: '#3276f6', color: '#061726'},
    {background: '#23c06b', color: '#062017'},
    {background: '#f5a524', color: '#281803'},
    {background: '#ff6b8a', color: '#2b0710'},
    {background: '#7c6ee6', color: '#100b2b'},
    {background: '#2dd4bf', color: '#061c26'},
    {background: '#8ab4ff', color: '#11305e'}
];

// ============================================
// СОСТОЯНИЕ
// ============================================

let notificationPermission = 'default';
let audioContext = null;
let notificationSound = null;
let originalTitle = document.title;
let unreadCount = 0;
let titleBlinkInterval = null;
let isPageVisible = true;

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

export function initNotifications() {
    // Проверяем поддержку Notifications API
    if ('Notification' in window) {
        notificationPermission = Notification.permission;

        // Если ещё не спрашивали — запросим разрешение при первом действии
        if (notificationPermission === 'default') {
            // Запрашиваем разрешение (лучше делать по клику пользователя)
            document.addEventListener('click', requestPermissionOnce, { once: true });
        }
    }

    // Отслеживаем видимость страницы
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Сбрасываем счётчик при фокусе
    window.addEventListener('focus', resetUnreadCount);

    // Предзагружаем звук
    preloadSound();

    console.log('Notifications initialized');
}

function requestPermissionOnce() {
    if (notificationPermission === 'default') {
        Notification.requestPermission().then(permission => {
            notificationPermission = permission;
            console.log('Notification permission:', permission);
        });
    }
}

function preloadSound() {
    try {
        notificationSound = new Audio(NotificationSettings.soundUrl);
        notificationSound.volume = NotificationSettings.soundVolume;
        notificationSound.preload = 'auto';
    } catch (e) {
        console.warn('Could not preload notification sound:', e);
    }
}

// ============================================
// ОСНОВНАЯ ФУНКЦИЯ УВЕДОМЛЕНИЯ
// ============================================

export function notifyNewMessage(senderName, messageText, avatarLetter = null, avatarKey = null) {
    // Увеличиваем счётчик непрочитанных
    unreadCount++;

    // Обновляем title
    updatePageTitle();

    if (NotificationSettings.browserEnabled) {
        showBrowserNotification(senderName, messageText, avatarLetter, avatarKey);
    }

    if (!isPageVisible) {
        startTitleBlink(senderName);
    }

    // Воспроизводим звук (всегда, если включён)
    if (NotificationSettings.soundEnabled) {
        playNotificationSound();
    }
}

// ============================================
// БРАУЗЕРНЫЕ УВЕДОМЛЕНИЯ
// ============================================

function showBrowserNotification(senderName, messageText, avatarLetter, avatarKey) {
    if (notificationPermission !== 'granted') {
        return;
    }

    const bodyText = String(messageText || '');
    const letter = avatarLetter || senderName?.[0] || '?';
    const options = {
        body: bodyText.length > 100 ? bodyText.substring(0, 100) + '...' : bodyText,
        icon: createAvatarDataUrl(letter, avatarKey || senderName),
        badge: '/static/images/icon_colored.ico',
        tag: 'chat-message', // группирует уведомления
        renotify: true,
        requireInteraction: false,
        silent: true // мы сами играем звук
    };

    try {
        const notification = new Notification(senderName, options);

        // Клик по уведомлению — фокус на окно
        notification.onclick = () => {
            window.focus();
            notification.close();
        };

        // Автозакрытие через 5 секунд
        setTimeout(() => notification.close(), 5000);

    } catch (e) {
        console.warn('Could not show notification:', e);
    }
}

// Создаём простую аватарку как data URL
function createAvatarDataUrl(letter, colorKey) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Фон
    const theme = getAvatarTheme(colorKey || letter);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, 64, 64);

    // Буква
    ctx.fillStyle = theme.color;
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter.toUpperCase(), 32, 32);

    return canvas.toDataURL();
}

function hashAvatarKey(key) {
    return String(key || '?').split('').reduce((hash, char) => {
        return ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    }, 0);
}

function getAvatarTheme(key) {
    const index = Math.abs(hashAvatarKey(key)) % AVATAR_THEMES.length;
    return AVATAR_THEMES[index];
}

// ============================================
// ЗВУК
// ============================================

function playNotificationSound() {
    if (!notificationSound) {
        preloadSound();
    }

    try {
        // Сбрасываем позицию и воспроизводим
        notificationSound.currentTime = 0;
        notificationSound.play().catch(e => {
            // Браузер может блокировать автовоспроизведение
            console.warn('Could not play notification sound:', e);
        });
    } catch (e) {
        console.warn('Sound playback error:', e);
    }
}

// ============================================
// TITLE СТРАНИЦЫ
// ============================================

function updatePageTitle() {
    if (unreadCount > 0) {
        document.title = `(${unreadCount}) ${originalTitle}`;
    } else {
        document.title = originalTitle;
    }
}

function startTitleBlink(senderName) {
    // Уже мигает — не запускаем повторно
    if (titleBlinkInterval) return;

    let showMessage = true;
    titleBlinkInterval = setInterval(() => {
        if (showMessage) {
            document.title = `💬 ${senderName}: новое сообщение!`;
        } else {
            document.title = `(${unreadCount}) ${originalTitle}`;
        }
        showMessage = !showMessage;
    }, 1000);
}

function stopTitleBlink() {
    if (titleBlinkInterval) {
        clearInterval(titleBlinkInterval);
        titleBlinkInterval = null;
    }
}

// ============================================
// ВИДИМОСТЬ СТРАНИЦЫ
// ============================================

function onVisibilityChange() {
    isPageVisible = !document.hidden;

    if (isPageVisible) {
        // Страница снова видна — сбрасываем мигание
        stopTitleBlink();
        updatePageTitle();
    }
}

export function resetUnreadCount() {
    unreadCount = 0;
    stopTitleBlink();
    document.title = originalTitle;
}

// ============================================
// УПРАВЛЕНИЕ НАСТРОЙКАМИ
// ============================================

export function toggleSound(enabled) {
    NotificationSettings.soundEnabled = enabled;
    localStorage.setItem('notif_sound', enabled);
}

export function toggleBrowserNotifications(enabled) {
    NotificationSettings.browserEnabled = enabled;
    localStorage.setItem('notif_browser', enabled);

    // Запрашиваем разрешение если включаем
    if (enabled && notificationPermission === 'default') {
        Notification.requestPermission().then(permission => {
            notificationPermission = permission;
        });
    }
}

export function setVolume(volume) {
    NotificationSettings.soundVolume = Math.max(0, Math.min(1, volume));
    if (notificationSound) {
        notificationSound.volume = NotificationSettings.soundVolume;
    }
    localStorage.setItem('notif_volume', NotificationSettings.soundVolume);
}

// Загружаем сохранённые настройки
export function loadNotificationSettings() {
    const savedSound = localStorage.getItem('notif_sound');
    const savedBrowser = localStorage.getItem('notif_browser');
    const savedVolume = localStorage.getItem('notif_volume');

    if (savedSound !== null) {
        NotificationSettings.soundEnabled = savedSound === 'true';
    }
    if (savedBrowser !== null) {
        NotificationSettings.browserEnabled = savedBrowser === 'true';
    }
    if (savedVolume !== null) {
        NotificationSettings.soundVolume = parseFloat(savedVolume);
    }
}

// ============================================
// ЗАПРОС РАЗРЕШЕНИЯ (для вызова по кнопке)
// ============================================

export function requestNotificationPermission() {
    return new Promise((resolve) => {
        if (!('Notification' in window)) {
            resolve('unsupported');
            return;
        }

        if (Notification.permission === 'granted') {
            resolve('granted');
            return;
        }

        Notification.requestPermission().then(permission => {
            notificationPermission = permission;
            resolve(permission);
        });
    });
}

// Экспортируем состояние
export function getNotificationState() {
    return {
        permission: notificationPermission,
        soundEnabled: NotificationSettings.soundEnabled,
        browserEnabled: NotificationSettings.browserEnabled,
        volume: NotificationSettings.soundVolume
    };
}
