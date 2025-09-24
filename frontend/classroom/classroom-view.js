// Global state variables
let participants = [
    { id: 1, name: "John Smith", avatar: "JS", role: "teacher", status: "online", joinTime: "Host" },
    { id: 2, name: "Emma Wilson", avatar: "EW", role: "student", status: "online", joinTime: "10:05 AM" },
    { id: 3, name: "Michael Brown", avatar: "MB", role: "student", status: "online", joinTime: "10:02 AM" },
    { id: 4, name: "Sarah Davis", avatar: "SD", role: "student", status: "online", joinTime: "10:08 AM" },
    { id: 5, name: "Alex Johnson", avatar: "AJ", role: "student", status: "away", joinTime: "10:15 AM" },
    { id: 6, name: "Lisa Chen", avatar: "LC", role: "student", status: "online", joinTime: "10:12 AM" }
];

let documents = [
    {
        id: 1,
        name: "Mathematics Chapter 5 - Algebra",
        type: "pdf",
        size: "2.4 MB",
        uploadedBy: "John Smith",
        uploadTime: "2 hours ago",
        filename: "math-chapter-5.pdf"
    },
    {
        id: 2,
        name: "Quadratic Equations Presentation",
        type: "powerpoint",
        size: "5.1 MB",
        uploadedBy: "John Smith",
        uploadTime: "1 day ago",
        filename: "quadratic-equations.pptx"
    },
    {
        id: 3,
        name: "Assignment Instructions - Week 5",
        type: "word",
        size: "1.2 MB",
        uploadedBy: "John Smith",
        uploadTime: "3 days ago",
        filename: "assignment-week-5.docx"
    },
    {
        id: 4,
        name: "Grade Sheet Template",
        type: "excel",
        size: "856 KB",
        uploadedBy: "Emma Wilson",
        uploadTime: "1 week ago",
        filename: "grade-sheet.xlsx"
    }
];

// Initialize the classroom when page loads
document.addEventListener("DOMContentLoaded", function () {
  const resourceForm = document.getElementById("resource-form");

  if (resourceForm) {
    resourceForm.addEventListener("submit", function (event) {
      event.preventDefault();
      uploadFile("resource");
    });
  }
});

const classroomIdInput = document.getElementById('classroom-id');
let classroomId = classroomIdInput ? classroomIdInput.value : window.location.pathname.split('/').pop().replace('.html','');
 
    
    // Update class duration every minute
    setInterval(updateClassDuration, 60000);
    
    // Simulate participant activity
    setInterval(simulateParticipantActivity, 30000);


// Initialize classroom functionality
function initializeClassroom() {
    console.log('Classroom initialized - Document sharing mode');
    
    // Add event listeners for file upload
    const fileUpload = document.getElementById('fileUpload');
    if (fileUpload) {
        fileUpload.addEventListener('change', handleFileUpload);
    }
    
    // Add drag and drop functionality
    const uploadArea = document.querySelector('.upload-area');
    if (uploadArea) {
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('drop', handleFileDrop);
        uploadArea.addEventListener('dragleave', handleDragLeave);
    }
}

// Update class duration display
function updateClassDuration() {
    const startTime = new Date();
    startTime.setHours(10, 0, 0, 0); // Set to 10:00 AM
    
    const now = new Date();
    const duration = Math.floor((now - startTime) / (1000 * 60)); // Duration in minutes
    
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    
    let durationText = 'Started 10:00 AM';
    if (duration > 0) {
        if (hours > 0) {
            durationText += ` • ${hours}h ${minutes}m`;
        } else {
            durationText += ` • ${minutes}m`;
        }
    }
    
    const durationElement = document.getElementById('class-duration');
    if (durationElement) {
        durationElement.textContent = durationText;
    }
    
    // Update session duration in stats
    const sessionDuration = document.getElementById('sessionDuration');
    if (sessionDuration) {
        if (hours > 0) {
            sessionDuration.textContent = `${hours}h ${minutes}m`;
        } else {
            sessionDuration.textContent = `${Math.max(duration, 1)} minutes`;
        }
    }
}

// Update participant count
function updateParticipantCount() {
    const participantCount = document.getElementById('participantCount');
    if (participantCount) {
        participantCount.textContent = `${participants.length} people`;
    }
}

// File upload handling
function handleFileUpload(event) {
    const files = event.target.files;
    for (let file of files) {
        uploadDocument(file);
    }
    // Clear the input so the same file can be uploaded again
    event.target.value = '';
}

function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.style.borderColor = '#1c1c1c';
    event.currentTarget.style.color = '#1c1c1c';
    event.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
}

function handleDragLeave(event) {
    event.preventDefault();
    const uploadArea = event.currentTarget;
    uploadArea.style.borderColor = '';
    uploadArea.style.color = '';
    uploadArea.style.background = '';
}

function handleFileDrop(event) {
    event.preventDefault();
    const uploadArea = event.currentTarget;
    uploadArea.style.borderColor = '';
    uploadArea.style.color = '';
    uploadArea.style.background = '';
    
    const files = event.dataTransfer.files;
    for (let file of files) {
        uploadDocument(file);
    }
}

// Upload document function
function uploadDocument(file) {
  const allowedTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
];

  const maxSize = 50 * 1024 * 1024;

  if (!allowedTypes.includes(file.type)) {
    showNotification('File type not supported.', 'error');
    return;
  }

  if (file.size > maxSize) {
    showNotification('File size too large.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', file.name.replace(/\.[^/.]+$/, ""));
  formData.append('type', 'resource');
  formData.append('classroomId', classroomId);

  fetch(`/api/files/upload/${classroomId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    },
    body: formData
  })
    .then(response => response.json())
    .then(data => {
      if (data.message === 'File uploaded successfully') {
        showNotification(`Document "${file.name}" uploaded successfully!`, 'success');

        // Update the UI
        const newDocument = {
          id: documents.length + 1,
          name: file.name.replace(/\.[^/.]+$/, ""),
          type: getFileType(file.type),
          size: formatFileSize(file.size),
          uploadedBy: "You",
          uploadTime: "Just now",
          filename: file.name
        };

        documents.unshift(newDocument);
        updateDocumentsList();
      } else {
        showNotification('Upload failed.', 'error');
      }
    })
    .catch(error => {
      console.error('Error uploading document:', error);
      showNotification('An error occurred.', 'error');
    });
}

// Update documents list in UI
function updateDocumentsList() {
    const documentsList = document.querySelector('.documents-list');
    if (!documentsList) return;
    
    documentsList.innerHTML = '';
    
    documents.forEach(doc => {
        const documentItem = createDocumentElement(doc);
        documentsList.appendChild(documentItem);
    });
}

// Create document element
function createDocumentElement(doc) {
    const documentItem = document.createElement('div');
    documentItem.className = 'document-item';
    if (doc.uploadTime === "Just now") {
        documentItem.classList.add('new');
    }
    
    const iconClass = getFileIconClass(doc.type);
    
    documentItem.innerHTML = `
        <div class="document-icon">
            <i class="${iconClass}"></i>
        </div>
        <div class="document-details">
            <h4>${doc.name}</h4>
            <div class="document-meta">
                <span class="file-size">${doc.size}</span>
                <span class="upload-time">Uploaded by ${doc.uploadedBy} • ${doc.uploadTime}</span>
            </div>
        </div>
        <div class="document-actions">
            <button class="action-btn download" onclick="downloadFile('${doc.filename}')">
                <i class="fas fa-download"></i>
            </button>
            <button class="action-btn view" onclick="viewFile('${doc.filename}')">
                <i class="fas fa-eye"></i>
            </button>
        </div>
    `;
    
    return documentItem;
}

// Get file type from MIME type
function getFileType(mimeType) {
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('word')) return 'word';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'powerpoint';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'excel';
    if (mimeType.includes('text')) return 'text';
    return 'file';
}

// Get file icon class
function getFileIconClass(type) {
    switch (type) {
        case 'pdf': return 'fas fa-file-pdf';
        case 'word': return 'fas fa-file-word';
        case 'powerpoint': return 'fas fa-file-powerpoint';
        case 'excel': return 'fas fa-file-excel';
        case 'text': return 'fas fa-file-alt';
        default: return 'fas fa-file';
    }
}

// Document actions
function downloadFile(filename) {
    showNotification(`Downloading ${filename}...`, 'info');
    console.log(`Download initiated for: ${filename}`);
    
    // In a real application, this would trigger an actual download
    // For demo purposes, we'll just show a notification
    setTimeout(() => {
        showNotification(`${filename} downloaded successfully!`, 'success');
    }, 1500);
}

function viewFile(filename) {
    showNotification(`Opening ${filename}...`, 'info');
    console.log(`View initiated for: ${filename}`);
    
    // In a real application, this would open the file in a viewer
    // For demo purposes, we'll just show a notification
    setTimeout(() => {
        showNotification(`${filename} opened in viewer`, 'success');
    }, 1000);
}

// Simulate participant activity
function simulateParticipantActivity() {
    // Randomly change participant status
    const randomParticipant = participants[Math.floor(Math.random() * participants.length)];
    if (randomParticipant.role !== 'teacher') {
        randomParticipant.status = randomParticipant.status === 'online' ? 'away' : 'online';
        updateParticipantsList();
    }
}

// Update participants list in UI
function updateParticipantsList() {
    const participantsList = document.querySelector('.participants-list');
    if (!participantsList) return;
    
    participantsList.innerHTML = '';
    
    participants.forEach(participant => {
        const participantItem = createParticipantElement(participant);
        participantsList.appendChild(participantItem);
    });
}

// Create participant element
function createParticipantElement(participant) {
    const participantItem = document.createElement('div');
    participantItem.className = `participant-item ${participant.role === 'teacher' ? 'teacher' : ''}`;
    
    participantItem.innerHTML = `
        <div class="participant-avatar">
            <div class="avatar-circle">${participant.avatar}</div>
            <div class="status-indicator ${participant.status}"></div>
        </div>
        <div class="participant-details">
            <h4>${participant.name}</h4>
            <span class="role-badge ${participant.role === 'teacher' ? 'teacher' : ''}">${participant.role === 'teacher' ? 'Teacher' : 'Student'}</span>
            <span class="join-time">${participant.joinTime}</span>
        </div>
    `;
    
    return participantItem;
}

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: 'Poppins', sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        max-width: 300px;
    `;
    
    // Set colors based on type
    switch (type) {
        case 'success':
            notification.style.background = '#28a745';
            notification.style.color = 'white';
            break;
        case 'error':
            notification.style.background = '#dc3545';
            notification.style.color = 'white';
            break;
        case 'warning':
            notification.style.background = '#ffc107';
            notification.style.color = '#1c1c1c';
            break;
        default:
            notification.style.background = 'rgba(28, 28, 28, 0.9)';
            notification.style.color = 'white';
    }
    
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 4 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

function leaveClass() {
    if (confirm('Are you sure you want to leave the classroom?')) {
        showNotification('Leaving classroom...', 'info');
        
        // In a real application, this would handle cleanup and navigation
        setTimeout(() => {
            window.location.href = 'index.html'; // Redirect to main page
        }, 1000);
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function(event) {
    // Only handle shortcuts when not typing in input fields
    if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
        switch(event.key.toLowerCase()) {
            case 'u':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    document.getElementById('fileUpload').click();
                }
                break;
            case 'escape':
                leaveClass();
                break;
        }
    }
});

// Initialize documents list on page load
document.addEventListener('DOMContentLoaded', function() {
    updateDocumentsList();
    updateParticipantsList();
});

console.log('Classroom JavaScript loaded successfully');
console.log('Features: Document sharing, Participant viewing');
console.log('Keyboard shortcuts: Ctrl+U (upload), Esc (leave)');

// Tab Switching Logic for Posts / Notes / Resources
document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      tabButtons.forEach(btn => btn.classList.remove("active"));
      tabContents.forEach(content => content.classList.remove("active"));

      const targetId = button.textContent.toLowerCase();
      const targetTab = document.getElementById(targetId);

      if (targetTab) {
        button.classList.add("active");
        targetTab.classList.add("active");
      }
    });
  });
});
function uploadFile(type) {
  const fileInput = document.getElementById(type + '-file');
  const titleInput = document.getElementById(type + '-title');

  const file = fileInput.files[0];
  const title = titleInput.value;

  if (!file || !title) {
    alert('Please select a file and enter a title.');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  formData.append('type', type);
  formData.append('classroomId', classroomId); // classroomId must be defined globally

  fetch(`/api/files/upload/${classroomId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    },
    body: formData
  })
    .then(response => response.json())
    .then(data => {
      if (data.message === 'File uploaded successfully') {
        alert('Upload successful!');
        // Optionally reload content
      } else {
        alert('Upload failed.');
      }
    })
    .catch(error => {
      console.error('Error uploading file:', error);
      alert('An error occurred.');
    });
}

