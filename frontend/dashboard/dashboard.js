class DashboardManager {
    constructor() {
        this.initCounters();
        this.initInteractions();
        this.loadRecentData();
        this.initAnimations();
    }

    initCounters() {
        const counters = document.querySelectorAll('.stat-number');

        counters.forEach(counter => {
            const finalValue = parseInt(counter.textContent);
            const duration = 1500;
            const increment = finalValue / (duration / 16);
            let currentValue = 0;

            const timer = setInterval(() => {
                currentValue += increment;
                if (currentValue >= finalValue) {
                    counter.textContent = finalValue;
                    clearInterval(timer);
                } else {
                    counter.textContent = Math.floor(currentValue);
                }
            }, 16);
        });
    }

    initInteractions() {
        const actionCards = document.querySelectorAll('.action-card');
        actionCards.forEach(card => {
            card.addEventListener('click', (e) => {
                this.handleActionClick(e.currentTarget);
            });
        });

        const noteItems = document.querySelectorAll('.note-item');
        noteItems.forEach(item => {
            item.addEventListener('click', (e) => {
                this.handleNoteClick(e.currentTarget);
            });
        });

        const interactiveElements = document.querySelectorAll('.stat-card, .action-card, .note-item, .update-item');
        interactiveElements.forEach(element => {
            element.addEventListener('mouseenter', () => {
                this.addHoverEffect(element);
            });

            element.addEventListener('mouseleave', () => {
                this.removeHoverEffect(element);
            });
        });
    }

    handleActionClick(card) {
        card.style.transform = 'translateY(-3px) scale(0.95)';

        setTimeout(() => {
            card.style.transform = 'translateY(-3px) scale(1)';
        }, 150);
    }

    handleNoteClick(item) {
        item.style.background = 'rgba(9, 12, 2, 0.05)';

        setTimeout(() => {
            item.style.background = 'rgba(9, 12, 2, 0.02)';
        }, 200);
    }

    addHoverEffect(element) {
        if (element.classList.contains('stat-card')) {
            element.style.transform = 'translateY(-5px) scale(1.02)';
        }
    }

    removeHoverEffect(element) {
        if (element.classList.contains('stat-card')) {
            element.style.transform = 'translateY(-5px) scale(1)';
        }
    }

    loadRecentData() {
        this.animateActivityItems();
        this.animateNoteItems();
        this.animateUpdateItems();
        
        // Use the standalone function to fetch and render classrooms
        fetchJoinedClassrooms();
    }

    animateActivityItems() {
        const activityItems = document.querySelectorAll('.activity-item');
        activityItems.forEach((item, index) => {
            item.style.opacity = '0';
            item.style.transform = 'translateX(-20px)';

            setTimeout(() => {
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '1';
                item.style.transform = 'translateX(0)';
            }, index * 100);
        });
    }

    animateNoteItems() {
        const noteItems = document.querySelectorAll('.note-item');
        noteItems.forEach((item, index) => {
            item.style.opacity = '0';
            item.style.transform = 'translateY(20px)';

            setTimeout(() => {
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            }, index * 150);
        });
    }

    animateUpdateItems() {
        const updateItems = document.querySelectorAll('.update-item');
        updateItems.forEach((item, index) => {
            item.style.opacity = '0';
            item.style.transform = 'translateX(20px)';

            setTimeout(() => {
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '1';
                item.style.transform = 'translateX(0)';
            }, index * 120);
        });
    }

    initAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.animation = 'fadeInUp 0.6s ease-out forwards';
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        const cards = document.querySelectorAll('.activity-section, .quick-actions, .recent-notes, .group-updates');
        cards.forEach(card => observer.observe(card));
    }

    refreshDashboard() {
        this.showLoadingState();

        setTimeout(() => {
            this.loadRecentData();
            this.hideLoadingState();
        }, 1000);
    }

    showLoadingState() {
        const cards = document.querySelectorAll('.activity-section, .quick-actions, .recent-notes, .group-updates');
        cards.forEach(card => {
            card.style.opacity = '0.5';
            card.style.pointerEvents = 'none';
        });
    }

    hideLoadingState() {
        const cards = document.querySelectorAll('.activity-section, .quick-actions, .recent-notes, .group-updates');
        cards.forEach(card => {
            card.style.opacity = '1';
            card.style.pointerEvents = 'auto';
        });
    }
}

function refreshDashboard() {
    const dashboard = new DashboardManager();
    dashboard.refreshDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
    new DashboardManager();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        refreshDashboard();
    }
});

// Fetch joined classrooms
function fetchJoinedClassrooms() {
  const token = localStorage.getItem('token');

  fetch('/api/classrooms/my', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) {
        renderJoinedClassrooms(data);
      } else if (data.classrooms) {
        renderJoinedClassrooms(data.classrooms);
      } else {
        console.error('Unexpected response:', data);
      }
    })
    .catch(err => {
      console.error('Error fetching classrooms:', err);
    });
}


// Render joined classrooms
function renderJoinedClassrooms(classrooms) {
  const joinedList = document.getElementById('joined-classrooms');
  joinedList.innerHTML = '';

  classrooms.forEach(classroom => {
    const li = document.createElement('li');
    li.className = 'classroom-card';
    li.setAttribute('data-id', classroom._id);
    li.innerHTML = `
      <h3>${classroom.name}</h3>
      <p>Code: ${classroom.code}</p>
      <button class="delete-classroom-btn">Delete</button>
      <a href="../classroom/classroom-view.html?id=${classroom._id}" class="view-classroom-btn">View</a>
    `;
    joinedList.appendChild(li);
  });

  // ✅ Attach event listeners to delete buttons
  const deleteButtons = document.querySelectorAll('.delete-classroom-btn');
  deleteButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      const classroomCard = e.target.closest('.classroom-card');
      const classroomId = classroomCard.getAttribute('data-id');

      const confirmDelete = confirm("Are you sure you want to delete this classroom?");
      if (!confirmDelete) return;

      try {
        const res = await fetch(`/api/classrooms/${classroomId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          }
        });

        const result = await res.json();
        if (res.ok) {
          alert('Classroom deleted successfully');
          classroomCard.remove(); // remove from DOM
        } else {
          alert(result.error || 'Failed to delete classroom');
        }
      } catch (err) {
        console.error(err);
        alert('An error occurred while deleting the classroom');
      }
    });
  });
}



// Add call to fetchJoinedClassrooms on DOM load (if not already present)
// Removed redundant DOMContentLoaded listener as it is handled in DashboardManager

// Removed redundant global click listener for delete buttons as it is handled in renderJoinedClassrooms
