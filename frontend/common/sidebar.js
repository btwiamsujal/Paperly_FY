class Sidebar {
    constructor() {
        this.isMobile = window.innerWidth <= 768;
        this.isCollapsed = this.isMobile;
        this.initSidebar();
        this.initEventListeners();
    }

    initSidebar() {
        const sidebarHTML = `
            <div class="sidebar ${this.isCollapsed ? 'collapsed' : ''}">
                <div class="sidebar-header">
                    <div class="brand">
                        <h2 class="brand-title">Paperly</h2>
                        <span class="brand-icon">📄</span>
                    </div>
                    <button class="sidebar-toggle" aria-label="Toggle sidebar">
                        <span class="hamburger"></span>
                    </button>
                </div>
                
                <nav class="sidebar-nav">
                    <a href="../home/home.html" class="nav-item" data-page="home">
                        <span class="nav-icon">🏠</span>
                        <span class="nav-text">Home</span>
                    </a>
                    <a href="../dashboard/dashboard.html" class="nav-item" data-page="dashboard">
                        <span class="nav-icon">📊</span>
                        <span class="nav-text">Dashboard</span>
                    </a>
                    <a href="../notes/notes.html" class="nav-item" data-page="notes">
                        <span class="nav-icon">📝</span>
                        <span class="nav-text">Notes</span>
                    </a>
                    <a href="../chatbox/chatbox.html" class="nav-item" data-page="chatbox">
                        <span class="nav-icon">💬</span>
                        <span class="nav-text">Chatbox</span>
                    </a>
                    <a href="../classroom/classroom.html" class="nav-item" data-page="classroom">
                        <span class="nav-icon">🏫</span>
                        <span class="nav-text">Classroom</span>
                    </a>
                    <a href="../ai/ai.html" class="nav-item" data-page="ai">
                        <span class="nav-icon">🤖</span>
                        <span class="nav-text">AI Summarizer</span>
                    </a>
                    <a href="../settings/settings.html" class="nav-item" data-page="settings">
                        <span class="nav-icon">⚙️</span>
                        <span class="nav-text">Settings</span>
                    </a>
                </nav>
                
                <div class="sidebar-footer">
                    <button class="nav-item logout-btn" onclick="logout()">
                        <span class="nav-icon">🚪</span>
                        <span class="nav-text">Logout</span>
                    </button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
        this.setActiveNavItem();
    }

    initEventListeners() {
        const toggleBtn = document.querySelector('.sidebar-toggle');
        const sidebar = document.querySelector('.sidebar');
        
        toggleBtn.addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (this.isMobile && !sidebar.contains(e.target) && !this.isCollapsed) {
                this.toggleSidebar();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        // Add hover effects for nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                if (!this.isCollapsed) {
                    item.style.transform = 'translateX(5px)';
                }
            });
            
            item.addEventListener('mouseleave', () => {
                item.style.transform = 'translateX(0)';
            });
        });
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        
        this.isCollapsed = !this.isCollapsed;
        
        if (this.isCollapsed) {
            sidebar.classList.add('collapsed');
            if (mainContent) {
                mainContent.style.marginLeft = this.isMobile ? '0' : '60px';
            }
        } else {
            sidebar.classList.remove('collapsed');
            if (mainContent) {
                mainContent.style.marginLeft = '260px';
            }
        }
    }

    handleResize() {
        const newIsMobile = window.innerWidth <= 768;
        if (newIsMobile !== this.isMobile) {
            this.isMobile = newIsMobile;
            this.isCollapsed = this.isMobile;
            
            const sidebar = document.querySelector('.sidebar');
            const mainContent = document.querySelector('.main-content');
            
            if (this.isMobile) {
                sidebar.classList.add('collapsed');
                if (mainContent) {
                    mainContent.style.marginLeft = '0';
                }
            } else {
                sidebar.classList.remove('collapsed');
                if (mainContent) {
                    mainContent.style.marginLeft = '260px';
                }
            }
        }
    }

    setActiveNavItem() {
        const currentPath = window.location.pathname;
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            const href = item.getAttribute('href');
            if (href && currentPath.includes(href.split('/').pop().split('.')[0])) {
                item.classList.add('active');
            }
        });
    }
}

// Global logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        // Clear any stored user data
        localStorage.removeItem('user');
        sessionStorage.clear();
        
        // Redirect to auth page
        window.location.href = '../auth/auth.html';
    }
}

// Initialize sidebar when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Apply saved theme preference across pages
    const settings = JSON.parse(localStorage.getItem('paperly_settings') || '{}');
    let theme = settings.theme || 'light';
    if (theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        theme = 'dark';
    }
    document.body.classList.toggle('theme-dark', theme === 'dark');

    new Sidebar();
});