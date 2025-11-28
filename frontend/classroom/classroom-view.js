// Global state variables
let participants = [];
let currentClassroomId = null;
let currentUserRole = null;
let currentUserId = null;

// Initialize the classroom when page loads
document.addEventListener("DOMContentLoaded", function () {
  initializeClassroomData();
  
  const resourceForm = document.getElementById("resource-form");
  if (resourceForm) {
    resourceForm.addEventListener("submit", function (event) {
      event.preventDefault();
      uploadResource();
    });
  }
});

// Initialize classroom data
function initializeClassroomData() {
  // Get classroom ID from URL or hidden input
  const classroomIdInput = document.getElementById('classroom-id');
  currentClassroomId = classroomIdInput ? classroomIdInput.value : getClassroomIdFromUrl();
  
  if (currentClassroomId) {
    loadClassroomMembers();
    fetchResources(); // Load resources on init
  } else {
    console.error('Classroom ID not found');
  }
}

// Get classroom ID from URL
function getClassroomIdFromUrl() {
  const pathParts = window.location.pathname.split('/');
  return pathParts[pathParts.length - 1].replace('.html', '');
}

// Load classroom members with roles
async function loadClassroomMembers() {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const response = await fetch(`http://localhost:5002/api/classrooms/${currentClassroomId}/members`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      participants = data.members || [];
      const currentUser = participants.find(p => p._id === getCurrentUserId());
      currentUserRole = currentUser ? currentUser.role : 'user';
      currentUserId = getCurrentUserId();
      
      updateParticipantsList();
      updateParticipantCount();
    }
  } catch (error) {
    console.error('Error loading members:', error);
  }
}

// Get current user ID from JWT token
function getCurrentUserId() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id;
  } catch (error) {
    return null;
  }
}

// --- Resource Management ---

async function fetchResources() {
  const token = localStorage.getItem('token');
  try {
    const response = await fetch(`http://localhost:5002/api/classrooms/${currentClassroomId}/resources`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const resources = await response.json();
      renderResources(resources);
    }
  } catch (error) {
    console.error('Error fetching resources:', error);
  }
}

function renderResources(resources) {
  const list = document.getElementById('resource-list');
  list.innerHTML = '';

  resources.forEach(resource => {
    const isOwner = resource.uploadedBy._id === currentUserId;
    const isAdmin = currentUserRole === 'admin';
    const canDelete = isOwner || isAdmin;
    const canEdit = isOwner || isAdmin; // Simplified for now

    const card = document.createElement('div');
    card.className = 'document-item';
    card.innerHTML = `
      <div class="document-icon">
        <i class="${getFileIconClass(resource.filename)}"></i>
      </div>
      <div class="document-details">
        <h4>${resource.title}</h4>
        <p>${resource.description || ''}</p>
        <div class="document-meta">
          <span class="upload-time">Uploaded by ${resource.uploadedBy.name} • ${new Date(resource.uploadedAt).toLocaleDateString()}</span>
        </div>
      </div>
      <div class="document-actions">
        <a href="http://localhost:5002${resource.fileUrl}" target="_blank" class="action-btn view">
          <i class="fas fa-eye"></i>
        </a>
        ${canDelete ? `<button class="action-btn delete" onclick="deleteResource('${resource._id}')"><i class="fas fa-trash"></i></button>` : ''}
      </div>
    `;
    list.appendChild(card);
  });
}

async function uploadResource() {
  const title = document.getElementById('resource-title').value;
  const description = document.getElementById('resource-description').value;
  const fileInput = document.getElementById('resource-file');
  const file = fileInput.files[0];

  if (!file || !title) {
    alert('Please provide title and file');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('description', description);
  formData.append('file', file);
  formData.append('messageType', 'document'); // Required by upload middleware

  const token = localStorage.getItem('token');

  try {
    const response = await fetch(`http://localhost:5002/api/classrooms/${currentClassroomId}/resources`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (response.ok) {
      alert('Resource uploaded successfully');
      document.getElementById('resource-form').reset();
      fetchResources(); // Refresh list
    } else {
      const data = await response.json();
      alert(data.message || 'Upload failed');
    }
  } catch (error) {
    console.error('Error uploading resource:', error);
    alert('Error uploading resource');
  }
}

async function deleteResource(resourceId) {
  if (!confirm('Are you sure you want to delete this resource?')) return;

  const token = localStorage.getItem('token');
  try {
    const response = await fetch(`http://localhost:5002/api/classrooms/${currentClassroomId}/resources/${resourceId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      fetchResources(); // Refresh list
    } else {
      alert('Failed to delete resource');
    }
  } catch (error) {
    console.error('Error deleting resource:', error);
  }
}

function getFileIconClass(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return 'fas fa-file-pdf';
  if (['doc', 'docx'].includes(ext)) return 'fas fa-file-word';
  if (['ppt', 'pptx'].includes(ext)) return 'fas fa-file-powerpoint';
  if (['xls', 'xlsx'].includes(ext)) return 'fas fa-file-excel';
  if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'fas fa-file-image';
  return 'fas fa-file';
}

// Tab Switching Logic
function showSection(sectionId) {
  document.querySelectorAll('.section').forEach(el => el.style.display = 'none');
  document.getElementById(sectionId).style.display = 'block';
  
  // Update active tab button style if needed
  document.querySelectorAll('.classroom-tabs button').forEach(btn => {
      if (btn.getAttribute('onclick').includes(sectionId)) {
          btn.classList.add('active');
      } else {
          btn.classList.remove('active');
      }
  });
}

// Update participant count
function updateParticipantCount() {
    const participantCount = document.getElementById('participantCount');
    if (participantCount) {
        participantCount.textContent = `${participants.length} people`;
    }
}

// Update participants list in UI
function updateParticipantsList() {
    const participantsList = document.getElementById('participantsList');
    if (!participantsList) return;
    
    if (participants.length === 0) {
        participantsList.innerHTML = '<div class="loading-participants"><i class="fas fa-spinner fa-spin"></i><span>Loading participants...</span></div>';
        return;
    }
    
    const isCurrentUserAdmin = currentUserRole === 'admin';
    
    participantsList.innerHTML = participants.map(participant => {
        const initials = getUserInitials(participant.name);
        const roleDisplay = participant.role === 'admin' ? 'Admin' : 'User';
        const joinTime = participant.isCreator ? 'Creator' : new Date(participant.joinedAt).toLocaleDateString();
        
        return `
            <div class="participant-item ${participant.role === 'admin' ? 'admin' : ''}">
                <div class="participant-avatar">
                    <div class="avatar-circle">${initials}</div>
                    <div class="status-indicator online"></div>
                </div>
                <div class="participant-details">
                    <h4>${participant.name}</h4>
                    <span class="role-badge ${participant.role === 'admin' ? 'admin' : ''}">${roleDisplay}</span>
                    <span class="join-time">${joinTime}</span>
                </div>
            </div>
        `;
    }).join('');
}

function getUserInitials(name) {
    if (!name) return '??';
    const names = name.split(' ');
    if (names.length >= 2) {
        return (names[0][0] + names[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function leaveClass() {
    if (confirm('Are you sure you want to leave the classroom?')) {
        // In a real application, this would handle cleanup and navigation
        window.location.href = 'index.html'; // Redirect to main page
    }
}


