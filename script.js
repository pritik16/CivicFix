/**
 * ==========================================================================
 * CivicFix — Stage 2: Client-Side JavaScript (script.js)
 * Features: Live Image Preview, File Validation, Custom Form Validation,
 *           and Mock Submission Handling.
 * ==========================================================================
 */

// Wait until the entire HTML DOM content is loaded before running scripts
document.addEventListener('DOMContentLoaded', () => {

  // --------------------------------------------------------------------------
  // 1. DOM Element References
  // --------------------------------------------------------------------------
  // We use document.getElementById to grab handles to our HTML elements.
  const reportForm = document.getElementById('report-form');
  const titleInput = document.getElementById('issue-title');
  const categorySelect = document.getElementById('issue-category');
  const descriptionInput = document.getElementById('issue-description');
  const locationInput = document.getElementById('issue-location');
  const photoInput = document.getElementById('issue-photo');
  const photoUploadBox = document.getElementById('photo-upload-label');
  const photoPreviewArea = document.getElementById('photo-preview-area');
  const successBanner = document.getElementById('form-success-banner');

  // Error message paragraph elements
  const titleError = document.getElementById('title-error');
  const categoryError = document.getElementById('category-error');
  const descriptionError = document.getElementById('description-error');
  const locationError = document.getElementById('location-error');
  const photoError = document.getElementById('photo-error');

  // Default placeholder HTML for the photo preview box
  const defaultPreviewHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
    <span class="preview-placeholder-text">No photo selected yet. Your attached image preview will render here.</span>
  `;

  // --------------------------------------------------------------------------
  // 2. Constants for File Validation
  // --------------------------------------------------------------------------
  // Acceptable image MIME types: PNG, JPEG/JPG, and WebP
  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  // 5 Megabytes in bytes: 5 * 1024 * 1024
  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

  // --------------------------------------------------------------------------
  // 3. Helper Functions to Show and Clear Validation Errors
  // --------------------------------------------------------------------------
  
  /**
   * Displays an error message below an input and highlights the input box in red.
   * @param {HTMLElement} inputElement - The form control that has an error
   * @param {HTMLElement} errorElement - The paragraph element that displays the message
   * @param {string} message - The text explanation of the error
   */
  function showError(inputElement, errorElement, message) {
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.add('visible');
    }
    if (inputElement) {
      inputElement.classList.add('input-error');
    }
  }

  /**
   * Clears the error message and removes the red highlight.
   * @param {HTMLElement} inputElement - The form control to reset
   * @param {HTMLElement} errorElement - The paragraph element to hide
   */
  function clearError(inputElement, errorElement) {
    if (errorElement) {
      errorElement.textContent = '';
      errorElement.classList.remove('visible');
    }
    if (inputElement) {
      inputElement.classList.remove('input-error');
    }
  }

  // --------------------------------------------------------------------------
  // 4. Live Image Preview & File Validation
  // --------------------------------------------------------------------------
  // We listen to the 'change' event on the file input, which fires when a user
  // picks or replaces a file in the file browser.
  photoInput.addEventListener('change', () => {
    // Check if the user selected at least one file
    const file = photoInput.files[0];

    // If the user opened the dialog and clicked "Cancel", reset preview
    if (!file) {
      photoPreviewArea.innerHTML = defaultPreviewHTML;
      return;
    }

    // 1. Validate File Type (MIME check)
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      showError(
        photoUploadBox,
        photoError,
        'Invalid file type. Please choose a PNG, JPEG/JPG, or WebP photo.'
      );
      // Reset the input value so invalid files are not submitted
      photoInput.value = '';
      photoPreviewArea.innerHTML = defaultPreviewHTML;
      return;
    }

    // 2. Validate File Size (Max 5MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const fileSizeInMB = (file.size / (1024 * 1024)).toFixed(1);
      showError(
        photoUploadBox,
        photoError,
        `File is too large (${fileSizeInMB} MB). Maximum allowed size is 5 MB.`
      );
      photoInput.value = '';
      photoPreviewArea.innerHTML = defaultPreviewHTML;
      return;
    }

    // If both validations pass, clear any previous photo error
    clearError(photoUploadBox, photoError);

    // 3. Read and Display the Image using FileReader
    const reader = new FileReader();

    // When the file has been successfully read into memory...
    reader.onload = (event) => {
      const imageDataUrl = event.target.result;

      // Render the image preview inside the preview container
      photoPreviewArea.innerHTML = `
        <img 
          src="${imageDataUrl}" 
          alt="Selected issue preview" 
          class="photo-preview-image"
        >
      `;
    };

    // Tell the FileReader to read the file as a Data URL (base64 string)
    reader.readAsDataURL(file);
  });

  // --------------------------------------------------------------------------
  // 5. Real-Time Error Clearing
  // --------------------------------------------------------------------------
  // As a good user experience (UX) practice, as soon as a user starts typing
  // to fix an error, we immediately clear the red error state for that field.
  titleInput.addEventListener('input', () => {
    if (titleInput.value.trim().length >= 5) {
      clearError(titleInput, titleError);
    }
  });

  categorySelect.addEventListener('change', () => {
    if (categorySelect.value !== '') {
      clearError(categorySelect, categoryError);
    }
  });

  descriptionInput.addEventListener('input', () => {
    if (descriptionInput.value.trim().length >= 15) {
      clearError(descriptionInput, descriptionError);
    }
  });

  locationInput.addEventListener('input', () => {
    if (locationInput.value.trim().length >= 5) {
      clearError(locationInput, locationError);
    }
  });

  // --------------------------------------------------------------------------
  // 6. Form Submission & Comprehensive Validation
  // --------------------------------------------------------------------------
  reportForm.addEventListener('submit',async (event) => {
    // PREVENT the browser's default behavior (which would reload the page)
    event.preventDefault();

    // Hide any previous success banner if the user is submitting again
    successBanner.classList.remove('visible');

    // Track overall form validity
    let isFormValid = true;
    let firstInvalidField = null;

    // Validate 1: Title (required, min 5 chars after trimming spaces)
    const titleValue = titleInput.value.trim();
    if (!titleValue) {
      showError(titleInput, titleError, 'Issue title is required.');
      isFormValid = false;
      firstInvalidField = firstInvalidField || titleInput;
    } else if (titleValue.length < 5) {
      showError(titleInput, titleError, 'Title must be at least 5 characters long.');
      isFormValid = false;
      firstInvalidField = firstInvalidField || titleInput;
    } else {
      clearError(titleInput, titleError);
    }

    // Validate 2: Category (must be selected)
    if (!categorySelect.value) {
      showError(categorySelect, categoryError, 'Please select a problem category.');
      isFormValid = false;
      firstInvalidField = firstInvalidField || categorySelect;
    } else {
      clearError(categorySelect, categoryError);
    }

    // Validate 3: Description (required, min 15 chars for helpful details)
    const descriptionValue = descriptionInput.value.trim();
    if (!descriptionValue) {
      showError(descriptionInput, descriptionError, 'Detailed description is required.');
      isFormValid = false;
      firstInvalidField = firstInvalidField || descriptionInput;
    } else if (descriptionValue.length < 15) {
      showError(
        descriptionInput,
        descriptionError,
        'Please provide more detail (at least 15 characters) so crews understand the issue.'
      );
      isFormValid = false;
      firstInvalidField = firstInvalidField || descriptionInput;
    } else {
      clearError(descriptionInput, descriptionError);
    }

    // Validate 4: Location (required, min 5 chars)
    const locationValue = locationInput.value.trim();
    if (!locationValue) {
      showError(locationInput, locationError, 'Location or landmark is required.');
      isFormValid = false;
      firstInvalidField = firstInvalidField || locationInput;
    } else if (locationValue.length < 5) {
      showError(locationInput, locationError, 'Please provide a more descriptive location.');
      isFormValid = false;
      firstInvalidField = firstInvalidField || locationInput;
    } else {
      clearError(locationInput, locationError);
    }

    // Validate 5: Photo (required)
    const photoFile = photoInput.files[0];
    if (!photoFile) {
      showError(photoUploadBox, photoError, 'Photo evidence is required to verify the issue.');
      isFormValid = false;
      firstInvalidField = firstInvalidField || photoUploadBox;
    } else {
      clearError(photoUploadBox, photoError);
    }

    // ------------------------------------------------------------------------
    // 7. Handle Validation Outcome
    // ------------------------------------------------------------------------
    if (!isFormValid) {
      // If any field failed, focus the first invalid element for good accessibility
      if (firstInvalidField && typeof firstInvalidField.focus === 'function') {
        firstInvalidField.focus();
      }
      return;
    }

   // If ALL validations passed:
try {
  const formData = new FormData();

formData.append('title', titleValue);
formData.append('category', categorySelect.value);
formData.append('description', descriptionValue);
formData.append('location', locationValue);
formData.append('photo', photoInput.files[0]);
console.log("CIVICFIX: Submit handler reached fetch");
  

  const response = await fetch('http://localhost:3000/api/issues', {
    method: 'POST',
    body:formData
  });
    
       

  const result = await response.json();

  if (response.ok) {
    // Show success message
    successBanner.classList.add('visible');

    // Reset form
    reportForm.reset();

    // Reset photo preview
    photoPreviewArea.innerHTML = defaultPreviewHTML;

    // Scroll to success message
    successBanner.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    console.log('CivicFix Backend Response:', result);
  } else {
    console.error('Backend Error:', result);
    alert('Failed to submit the issue. Please try again.');
  }

} catch (error) {
  alert('Connection Error: ' + error.message);
console.error('Connection Error:', error);
  alert('Cannot connect to CivicFix server. Make sure the backend is running.');
}
  });
});