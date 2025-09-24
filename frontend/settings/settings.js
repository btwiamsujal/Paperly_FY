class SettingsManager {
    constructor() {
        this.currentSection = 'profile';
        this.settings = this.loadSettings();
        this.init();
    }

    init() {
        this.initEventListeners();
        this.loadUserData();
        this.applySettings();
    }

    initEventListeners() {
        // Navigation
        const navItems = document.querySelectorAll('.settings-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.section;
                this.switchSection(section);
            });
        });

        // Forms
        document.getElementById('profileForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProfile();
        });

        document.getElementById('passwordForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.changePassword();
        });

        // Theme selection
        const themeOptions = document.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                const theme = e.currentTarget.dataset.theme;
                this.changeTheme(theme);
            });
        });

        // Toggle switches
        const toggles = document.querySelectorAll('.toggle-switch input');
        toggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                this.handleToggleChange(e.target.id, e.target.checked);
            });
        });

        // Browser notifications permission
        document.getElementById('browserNotifications').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.requestNotificationPermission();
            }
        });
    }

    switchSection(sectionName) {
        // Remove active class from all nav items and sections
        document.querySelectorAll('.settings-nav-item').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));

        // Add active class to clicked nav item and corresponding section
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
        document.getElementById(sectionName).classList.add('active');

        this.currentSection = sectionName;
    }

    loadSettings() {
        const saved = localStorage.getItem('paperly_settings');
        if (saved) {
            return JSON.parse(saved);
        }
        
        return {
            theme: 'light',
            notifications: {
                emailMessages: true,
                emailNotes: true,
                browserNotifications: false
            },
            privacy: {
                publicProfile: true,
                onlineStatus: true,
                analytics: true
            },
            appearance: {
                compactMode: false,
                animations: true
            },
            security: {
                sms2fa: false,
                app2fa: false
            }
        };
    }

    saveSettings() {
        localStorage.setItem('paperly_settings', JSON.stringify(this.settings));
    }

    loadUserData() {
        // Load user profile data (in a real app, this would come from an API)
        const userData = {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            role: 'student',
            institution: 'University of Technology',
            bio: 'Computer Science student passionate about AI and machine learning.'
        };

        // Populate form fields
        document.getElementById('firstName').value = userData.firstName;
        document.getElementById('lastName').value = userData.lastName;
        document.getElementById('email').value = userData.email;
        document.getElementById('role').value = userData.role;
        document.getElementById('institution').value = userData.institution;
        document.getElementById('bio').value = userData.bio;

        // Update avatar
        const avatar = document.querySelector('.profile-avatar .avatar-text');
        avatar.textContent = userData.firstName[0] + userData.lastName[0];
    }

    applySettings() {
        // Apply theme
        this.setTheme(this.settings.theme);

        // Apply toggle states
        Object.entries(this.settings.notifications).forEach(([key, value]) => {
            const toggle = document.getElementById(key);
            if (toggle) toggle.checked = value;
        });

        Object.entries(this.settings.privacy).forEach(([key, value]) => {
            const toggle = document.getElementById(key);
            if (toggle) toggle.checked = value;
        });

        Object.entries(this.settings.appearance).forEach(([key, value]) => {
            const toggle = document.getElementById(key);
            if (toggle) toggle.checked = value;
        });

        Object.entries(this.settings.security).forEach(([key, value]) => {
            const toggle = document.getElementById(key);
            if (toggle) toggle.checked = value;
        });
    }

    saveProfile() {
        const formData = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            institution: document.getElementById('institution').value,
            bio: document.getElementById('bio').value
        };

        // Simulate API call
        setTimeout(() => {
            // Update avatar
            const avatar = document.querySelector('.profile-avatar .avatar-text');
            avatar.textContent = formData.firstName[0] + formData.lastName[0];
            
            this.showMessage('Profile updated successfully!', 'success');
        }, 500);
    }

    changePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
            this.showMessage('New passwords do not match!', 'error');
            return;
        }

        if (newPassword.length < 8) {
            this.showMessage('Password must be at least 8 characters long!', 'error');
            return;
        }

        const token = localStorage.getItem('token');

        fetch('http://localhost:5002/api/auth/change-password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
        })
        .then(res => res.json().then(data => ({ status: res.status, body: data })))
        .then(({ status, body }) => {
            if (status === 200) {
                document.getElementById('passwordForm').reset();
                this.showMessage('Password changed successfully!', 'success');
            } else {
                this.showMessage(body.message || 'Failed to change password', 'error');
            }
        })
        .catch(() => {
            this.showMessage('Server error changing password', 'error');
        });
    }

    changeTheme(theme) {
        // Remove active class from all theme options
        document.querySelectorAll('.theme-option').forEach(option => option.classList.remove('active'));
        
        // Add active class to selected theme
        document.querySelector(`[data-theme="${theme}"]`).classList.add('active');
        
        // Apply theme
        this.setTheme(theme);
        
        // Save setting
        this.settings.theme = theme;
        this.saveSettings();
    }

    setTheme(theme) {
        const body = document.body;
        
        // Remove existing theme classes
        body.classList.remove('theme-light', 'theme-dark', 'theme-auto');
        
        // Apply new theme
        if (theme === 'dark') {
            body.classList.add('theme-dark');
        } else if (theme === 'auto') {
            body.classList.add('theme-auto');
            // Check system preference
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                body.classList.add('theme-dark');
            }
        } else {
            body.classList.add('theme-light');
        }
    }

    handleToggleChange(settingId, value) {
        // Update settings object
        if (settingId in this.settings.notifications) {
            this.settings.notifications[settingId] = value;
        } else if (settingId in this.settings.privacy) {
            this.settings.privacy[settingId] = value;
        } else if (settingId in this.settings.appearance) {
            this.settings.appearance[settingId] = value;
        } else if (settingId in this.settings.security) {
            this.settings.security[settingId] = value;
        }

        // Apply specific setting changes
        this.applySettingChange(settingId, value);
        
        // Save settings
        this.saveSettings();
    }

    applySettingChange(settingId, value) {
        switch (settingId) {
            case 'compactMode':
                document.body.classList.toggle('compact-mode', value);
                break;
            case 'animations':
                document.body.classList.toggle('no-animations', !value);
                break;
            case 'sms2fa':
            case 'app2fa':
                if (value) {
                    this.showMessage(`${settingId === 'sms2fa' ? 'SMS' : 'App'} 2FA enabled`, 'success');
                }
                break;
        }
    }

    requestNotificationPermission() {
        if ('Notification' in window) {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    this.showMessage('Browser notifications enabled!', 'success');
                    new Notification('Paperly', {
                        body: 'You will now receive notifications from Paperly',
                        icon: '/favicon.ico'
                    });
                } else {
                    document.getElementById('browserNotifications').checked = false;
                    this.showMessage('Notification permission denied', 'error');
                }
            });
        } else {
            document.getElementById('browserNotifications').checked = false;
            this.showMessage('Notifications not supported in this browser', 'error');
        }
    }

    exportNotes() {
        // Simulate export
        this.showMessage('Exporting notes...', 'info');
        
        setTimeout(() => {
            const data = {
                notes: JSON.parse(localStorage.getItem('paperly_notes') || '[]'),
                exportDate: new Date().toISOString()
            };
            
            this.downloadJSON(data, 'paperly_notes_export.json');
            this.showMessage('Notes exported successfully!', 'success');
        }, 1000);
    }

    exportMessages() {
        // Simulate export
        this.showMessage('Exporting messages...', 'info');
        
        setTimeout(() => {
            const data = {
                chats: JSON.parse(localStorage.getItem('paperly_chats') || '[]'),
                messages: JSON.parse(localStorage.getItem('paperly_messages') || '{}'),
                exportDate: new Date().toISOString()
            };
            
            this.downloadJSON(data, 'paperly_messages_export.json');
            this.showMessage('Messages exported successfully!', 'success');
        }, 1000);
    }

    exportAll() {
        // Simulate export
        this.showMessage('Exporting all data...', 'info');
        
        setTimeout(() => {
            const data = {
                notes: JSON.parse(localStorage.getItem('paperly_notes') || '[]'),
                chats: JSON.parse(localStorage.getItem('paperly_chats') || '[]'),
                messages: JSON.parse(localStorage.getItem('paperly_messages') || '{}'),
                aiHistory: JSON.parse(localStorage.getItem('paperly_ai_history') || '[]'),
                settings: this.settings,
                exportDate: new Date().toISOString()
            };
            
            this.downloadJSON(data, 'paperly_full_export.json');
            this.showMessage('All data exported successfully!', 'success');
        }, 1500);
    }

    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    clearMessages() {
        if (confirm('Are you sure you want to clear all messages? This action cannot be undone.')) {
            localStorage.removeItem('paperly_chats');
            localStorage.removeItem('paperly_messages');
            this.showMessage('Messages cleared successfully!', 'success');
        }
    }

    clearSummaries() {
        if (confirm('Are you sure you want to clear all AI summaries? This action cannot be undone.')) {
            localStorage.removeItem('paperly_ai_history');
            this.showMessage('AI summaries cleared successfully!', 'success');
        }
    }

    clearAllData() {
        if (confirm('Are you sure you want to clear ALL data? This action cannot be undone and will log you out.')) {
            // Clear all localStorage data
            const keysToKeep = ['paperly_settings']; // Keep settings
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('paperly_') && !keysToKeep.includes(key)) {
                    localStorage.removeItem(key);
                }
            });
            
            this.showMessage('All data cleared successfully!', 'success');
            
            // Redirect to auth page after a delay
            setTimeout(() => {
                window.location.href = '../auth/auth.html';
            }, 2000);
        }
    }

    deleteAccount() {
        const confirmation = prompt('Type "DELETE" to confirm account deletion:');

        if (confirmation === 'DELETE') {
            const token = localStorage.getItem('token');

            fetch('http://localhost:5002/api/auth/delete-account', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(res => res.json().then(data => ({ status: res.status, body: data })))
            .then(({ status, body }) => {
                if (status === 200) {
                    localStorage.clear();
                    sessionStorage.clear();
                    this.showMessage('Account deleted successfully. Redirecting...', 'success');
                    setTimeout(() => {
                        window.location.href = '../auth/auth.html';
                    }, 2000);
                } else {
                    this.showMessage(body.message || 'Account deletion failed', 'error');
                }
            })
            .catch(() => {
                this.showMessage('Server error deleting account', 'error');
            });
        } else if (confirmation !== null) {
            this.showMessage('Account deletion cancelled - confirmation text did not match', 'error');
        }
    }

    showMessage(message, type) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.textContent = message;
        
        const colors = {
            success: '#4CAF50',
            error: '#f44336',
            info: '#2196F3'
        };
        
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1001;
            animation: slideIn 0.3s ease-out;
            background: ${colors[type] || '#666'};
        `;

        document.body.appendChild(messageEl);

        setTimeout(() => {
            messageEl.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                messageEl.remove();
            }, 300);
        }, 3000);
    }
}

// Global functions for HTML onclick handlers
function changeAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // In a real app, you would upload the file
            settingsManager.showMessage('Avatar updated successfully!', 'success');
        }
    });
    
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
}

function removeAvatar() {
    if (confirm('Are you sure you want to remove your avatar?')) {
        settingsManager.showMessage('Avatar removed successfully!', 'success');
    }
}

function resetProfile() {
    if (confirm('Are you sure you want to reset your profile to the last saved version?')) {
        settingsManager.loadUserData();
        settingsManager.showMessage('Profile reset successfully!', 'info');
    }
}

function exportNotes() {
    settingsManager.exportNotes();
}

function exportMessages() {
    settingsManager.exportMessages();
}

function exportAll() {
    settingsManager.exportAll();
}

function clearMessages() {
    settingsManager.clearMessages();
}

function clearSummaries() {
    settingsManager.clearSummaries();
}

function clearAllData() {
    settingsManager.clearAllData();
}

function deleteAccount() {
    settingsManager.deleteAccount();
}

// Initialize settings manager
let settingsManager;
document.addEventListener('DOMContentLoaded', () => {
    settingsManager = new SettingsManager();
});

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }

    .compact-mode .settings-card,
    .compact-mode .profile-card {
        padding: 20px !important;
    }

    .compact-mode .setting-item {
        padding: 10px 0 !important;
    }

    /* No animations */
    .no-animations * {
        animation: none !important;
        transition: none !important;
    }
`;
document.head.appendChild(style);