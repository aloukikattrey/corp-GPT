import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useTheme } from './ThemeContext';

// Utility to get initials from name
function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(' ');
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function ProfileSettings({ onClose, user, db, auth }) {
  const { darkMode } = useTheme();
  const [activeSection, setActiveSection] = useState('profile');
  const [editingFirstName, setEditingFirstName] = useState(false);
  const [editingLastName, setEditingLastName] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [userName, setUserName] = useState('');
  const [originalFirstName, setOriginalFirstName] = useState('');
  const [originalLastName, setOriginalLastName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showCropDialog, setShowCropDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [croppedImage, setCroppedImage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user && db) {
        const profileRef = doc(db, 'users', user.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const userData = profileSnap.data();
          const fullName = userData.name || '';
          const nameParts = fullName.trim().split(' ');
          const first = nameParts[0] || '';
          const last = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
          
          setFirstName(first);
          setLastName(last);
          setUserName(fullName);
          setOriginalFirstName(first);
          setOriginalLastName(last);
          
          // Set profile image if exists
          if (userData.profileImage) {
            setProfileImageUrl(userData.profileImage);
          }
        }
      }
    };
    fetchProfile();
  }, [user, db]);

  // Check if any changes were made
  const hasChanges = firstName !== originalFirstName || lastName !== originalLastName;
  const hasValidChanges = hasChanges && firstName.trim() !== '' && lastName.trim() !== '';

  const handleSave = async () => {
    if (!hasValidChanges) return;
    
    setIsSaving(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const profileRef = doc(db, 'users', user.uid);
      await setDoc(profileRef, { name: fullName }, { merge: true });
      
      // Update original values to reflect saved state
      setOriginalFirstName(firstName.trim());
      setOriginalLastName(lastName.trim());
      setUserName(fullName);
      
      // Exit edit modes
      setEditingFirstName(false);
      setEditingLastName(false);
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select an image file (JPEG, PNG, GIF)');
      return;
    }

    // Check file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setErrorMessage('File size must be less than 5MB');
      return;
    }

    setErrorMessage('');
    setSelectedImage(file);
    setShowCropDialog(true);
  };

  const handleCropComplete = (croppedImageBlob) => {
    setCroppedImage(croppedImageBlob);
  };

  const handleUploadImage = async () => {
    if (!croppedImage) return;

    setIsUploading(true);
    try {
      // Convert blob to base64 for storage
      const base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(croppedImage);
      });
      
      // Save to database
      const profileRef = doc(db, 'users', user.uid);
      await setDoc(profileRef, { 
        profileImage: base64Image 
      }, { merge: true });
      
      setProfileImageUrl(base64Image);
      setShowCropDialog(false);
      setSelectedImage(null);
      setCroppedImage(null);
    } catch (error) {
      console.error('Error uploading image:', error);
      setErrorMessage('Failed to upload image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteImage = async () => {
    try {
      // Remove from database
      const profileRef = doc(db, 'users', user.uid);
      await setDoc(profileRef, { 
        profileImage: null 
      }, { merge: true });
      
      setProfileImageUrl('');
      setErrorMessage('');
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Error deleting image:', error);
      setErrorMessage('Failed to delete image. Please try again.');
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage('Please fill in all password fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirm password do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters long.');
      return;
    }

    setIsChangingPassword(true);
    setErrorMessage('');
    setPasswordSuccess('');

    try {
      // Re-authenticate user with current password
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      // Clear form and show success message
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password changed successfully!');
    } catch (error) {
      console.error('Error changing password:', error);
      if (error.code === 'auth/wrong-password') {
        setErrorMessage('Current password is incorrect.');
      } else if (error.code === 'auth/weak-password') {
        setErrorMessage('New password is too weak. Please choose a stronger password.');
      } else {
        setErrorMessage('Failed to change password. Please try again.');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col relative overflow-hidden bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between px-4 pt-4 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 p-0"
            style={{ minWidth: 36, minHeight: 36 }}
            title="Back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-5 h-5 mx-auto my-auto text-gray-700 dark:text-gray-300" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span className="text-xl font-medium tracking-tight text-gray-800 dark:text-white">Settings</span>
        </div>
      </div>
      
      {/* Navigation Tabs */}
      <div className="w-full max-w-4xl mx-auto px-4 pt-6">
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveSection('profile')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeSection === 'profile'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveSection('password')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeSection === 'password'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Password
          </button>
        </div>
      </div>
      
      {/* Content Area */}
      <div className="flex flex-1 w-full max-w-4xl mx-auto px-4 pt-8">
        {activeSection === 'profile' && (
          <div className="w-full">
            
            {/* Error Message */}
            {errorMessage && (
              <div className="mb-3 p-2 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-500 text-red-700 dark:text-red-400 rounded-md text-xs">
                {errorMessage}
              </div>
            )}
            
            {/* Profile Image and Name Section */}
            <div className="flex items-start gap-6">
              {/* Profile Image */}
              <div className="relative group">
                {profileImageUrl ? (
                  <img 
                    src={profileImageUrl} 
                    alt="Profile" 
                    className="w-20 h-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold">
                    {userName ? getInitials(userName) : 'U'}
                  </div>
                )}
                {/* Pencil icon on hover */}
                <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                {/* Hidden file input */}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ zIndex: 10 }}
                />
              </div>
              
              {/* Delete button - only show if profile image exists */}
              {profileImageUrl && (
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  className="mt-2 p-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-full transition-colors"
                  title="Delete profile picture"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
              
              {/* Name Fields */}
              <div className="flex-1 space-y-3">
                {/* First Name */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                    <div className="flex items-center gap-2">
                      {editingFirstName ? (
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          placeholder="Enter first name"
                          autoFocus
                          onBlur={() => setEditingFirstName(false)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              setEditingFirstName(false);
                            }
                          }}
                        />
                      ) : (
                        <span className="flex-1 px-2 py-1 text-sm text-gray-900 dark:text-white">{firstName || 'Not set'}</span>
                      )}
                      <button 
                        onClick={() => setEditingFirstName(true)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Last Name */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                    <div className="flex items-center gap-2">
                      {editingLastName ? (
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          placeholder="Enter last name"
                          autoFocus
                          onBlur={() => setEditingLastName(false)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              setEditingLastName(false);
                            }
                          }}
                        />
                      ) : (
                        <span className="flex-1 px-2 py-1 text-sm text-gray-900 dark:text-white">{lastName || 'Not set'}</span>
                      )}
                      <button 
                        onClick={() => setEditingLastName(true)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Save Changes Button */}
            <div className="flex justify-center mt-8">
              <button
                onClick={handleSave}
                disabled={!hasValidChanges || isSaving}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  hasValidChanges && !isSaving
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                }`}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            <hr className="my-8 border-t border-gray-200 dark:border-gray-700" />
            <h1 className="text-base mb-2 text-gray-900 dark:text-white">Delete AI Conversations from Homepage?</h1>
            <p className='text-xs text-gray-700 dark:text-gray-300'>This will delete your AI conversation history on the Homepage. Once you delete the history, you will not be able to recover it.</p>
            {/* Delete Homepage AI Chats Button */}
            <div className="flex mt-6">
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete all Homepage AI chat history? This action cannot be undone.')) {
                    localStorage.removeItem('homepageAIConversation');
                    localStorage.removeItem('homepageAIHasConversation');
                    alert('Homepage AI chat history has been deleted successfully.');
                  }
                }}
                className="px-3 py-1.5 rounded text-sm font-medium bg-gray-600 text-white hover:bg-gray-700 transition-colors"
              >
                Delete Homepage AI Conversations
              </button>
            </div>


          </div>
        )}
        
        {activeSection === 'password' && (
          <div className="w-full">
            <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">Change your Password</h2>
            
            {/* Check if user signed in with Google */}
            {user.providerData[0]?.providerId === 'google.com' ? (
              <div className="space-y-3 max-w-sm">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <h3 className="text-xs font-medium text-blue-800 dark:text-blue-300">Google Account</h3>
                      <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                        You signed in with Google. Password changes are managed through your Google account settings.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Error Message */}
                {errorMessage && (
                  <div className="mb-3 p-2 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-500 text-red-700 dark:text-red-400 rounded-md text-xs">
                    {errorMessage}
                  </div>
                )}
                
                {/* Success Message */}
                {passwordSuccess && (
                  <div className="mb-3 p-2 bg-green-100 dark:bg-green-900/20 border border-green-400 dark:border-green-500 text-green-700 dark:text-green-400 rounded-md text-xs">
                    {passwordSuccess}
                  </div>
                )}
                
                {/* Password Change Form */}
                <div className="space-y-3 max-w-sm">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="Enter current password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                      >
                        {showCurrentPassword ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                      >
                        {showNewPassword ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="Confirm new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                      >
                        {showConfirmPassword ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleChangePassword}
                    disabled={isChangingPassword}
                    className={`w-full px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      isChangingPassword
                        ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isChangingPassword ? 'Changing Password...' : 'Save Password'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Crop Dialog */}
      {showCropDialog && selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Review Your Picture</h3>
            
            {/* Simple crop preview - in a real app you'd use a proper crop library */}
            <div className="mb-4">
              <img 
                src={URL.createObjectURL(selectedImage)} 
                alt="Preview" 
                className="w-full h-64 object-cover rounded-lg"
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCropDialog(false);
                  setSelectedImage(null);
                  setErrorMessage('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  // For now, we'll use the original image as "cropped"
                  // In a real implementation, you'd use a proper crop library
                  setCroppedImage(selectedImage);
                  await handleUploadImage();
                }}
                disabled={isUploading}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  isUploading
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isUploading ? 'Uploading...' : 'Upload Picture'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Profile Picture</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Are you sure you want to delete your profile picture? This action cannot be undone.
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteImage}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileSettings; 