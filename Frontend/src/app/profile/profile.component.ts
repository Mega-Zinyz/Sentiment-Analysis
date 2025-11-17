import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

interface ApiCredentials {
  bearerToken?: string;
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessTokenSecret?: string;
}

interface CredentialsInfo {
  configured: boolean;
  credentials: ApiCredentials | null;
  expiresAt: string | null;
  isActive: boolean;
  isExpired: boolean;
  lastUpdated: string;
}

interface UserSession {
  id: string;
  created_at: string;
  expires_at: string;
  status: 'active' | 'expired';
}

interface ProfileData {
  user: UserProfile;
  credentials: {
    hasCredentials: boolean;
    expiresAt: string | null;
    isActive: boolean;
    lastUpdated: string | null;
    isExpired: boolean;
  };
  statistics: {
    totalAnalyses: number;
    totalWordLibraries: number;
  };
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  private apiUrl = environment.apiUrl;
  
  profileData: ProfileData | null = null;
  credentialsInfo: CredentialsInfo | null = null;
  
  loading = false;
  error = '';
  success = '';
  
  // Profile update form
  profileForm = {
    username: '',
    email: ''
  };
  
  // Password change form
  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  
  // API credentials form
  credentialsForm = {
    bearerToken: '',
    apiKey: '',
    apiSecret: '',
    accessToken: '',
    accessTokenSecret: '',
    expiresAt: ''
  };
  
  // Session management
  userSessions: any[] = [];
  sessionsLoading = false;
  
  activeTab = 'profile'; // profile, password, api-credentials, sessions

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadProfile();
    this.loadApiCredentials();
    this.loadUserSessions();
  }

  async loadProfile() {
    try {
      const headers = this.authService.getAuthHeaders();
      this.profileData = await this.http.get<ProfileData>(`${this.apiUrl}/profile`, { headers }).toPromise() || null;
      
      if (this.profileData) {
        this.profileForm.username = this.profileData.user.username;
        this.profileForm.email = this.profileData.user.email;
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      this.error = 'Failed to load profile';
    }
  }

  async loadApiCredentials() {
    try {
      const headers = this.authService.getAuthHeaders();
      this.credentialsInfo = await this.http.get<CredentialsInfo>(`${this.apiUrl}/profile/api-credentials`, { headers }).toPromise() || null;
    } catch (error) {
      console.error('Error loading API credentials:', error);
    }
  }

  async updateProfile() {
    if (!this.validateProfileForm()) return;
    
    this.loading = true;
    this.error = '';
    this.success = '';
    
    try {
      const headers = this.authService.getAuthHeaders();
      await this.http.put(`${this.apiUrl}/profile`, this.profileForm, { headers }).toPromise();
      
      this.success = 'Profile updated successfully!';
      setTimeout(() => this.success = '', 3000);
      
      // Reload profile data
      await this.loadProfile();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      this.error = error.error?.error || 'Failed to update profile';
      setTimeout(() => this.error = '', 5000);
    } finally {
      this.loading = false;
    }
  }

  async changePassword() {
    if (!this.validatePasswordForm()) return;
    
    this.loading = true;
    this.error = '';
    this.success = '';
    
    try {
      const headers = this.authService.getAuthHeaders();
      await this.http.put(`${this.apiUrl}/profile/password`, this.passwordForm, { headers }).toPromise();
      
      this.success = 'Password changed successfully!';
      setTimeout(() => this.success = '', 3000);
      
      // Clear password form
      this.passwordForm = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      };
    } catch (error: any) {
      console.error('Error changing password:', error);
      this.error = error.error?.error || 'Failed to change password';
      setTimeout(() => this.error = '', 5000);
    } finally {
      this.loading = false;
    }
  }

  async updateApiCredentials() {
    if (!this.validateCredentialsForm()) return;
    
    this.loading = true;
    this.error = '';
    this.success = '';
    
    try {
      const headers = this.authService.getAuthHeaders();
      await this.http.put(`${this.apiUrl}/profile/api-credentials`, this.credentialsForm, { headers }).toPromise();
      
      this.success = 'API credentials updated successfully!';
      setTimeout(() => this.success = '', 3000);
      
      // Reload credentials
      await this.loadApiCredentials();
    } catch (error: any) {
      console.error('Error updating API credentials:', error);
      this.error = error.error?.error || 'Failed to update API credentials';
      setTimeout(() => this.error = '', 5000);
    } finally {
      this.loading = false;
    }
  }

  async deleteApiCredentials() {
    if (!confirm('Are you sure you want to delete your API credentials? This action cannot be undone.')) {
      return;
    }
    
    this.loading = true;
    this.error = '';
    this.success = '';
    
    try {
      const headers = this.authService.getAuthHeaders();
      await this.http.delete(`${this.apiUrl}/profile/api-credentials`, { headers }).toPromise();
      
      this.success = 'API credentials deleted successfully!';
      setTimeout(() => this.success = '', 3000);
      
      // Clear credentials form and reload
      this.clearCredentialsForm();
      await this.loadApiCredentials();
    } catch (error: any) {
      console.error('Error deleting API credentials:', error);
      this.error = error.error?.error || 'Failed to delete API credentials';
      setTimeout(() => this.error = '', 5000);
    } finally {
      this.loading = false;
    }
  }

  validateProfileForm(): boolean {
    if (!this.profileForm.username || !this.profileForm.email) {
      this.error = 'Username and email are required';
      setTimeout(() => this.error = '', 5000);
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.profileForm.email)) {
      this.error = 'Please enter a valid email address';
      setTimeout(() => this.error = '', 5000);
      return false;
    }

    return true;
  }

  validatePasswordForm(): boolean {
    if (!this.passwordForm.currentPassword) {
      this.error = 'Current password is required';
      setTimeout(() => this.error = '', 5000);
      return false;
    }

    if (!this.passwordForm.newPassword) {
      this.error = 'New password is required';
      setTimeout(() => this.error = '', 5000);
      return false;
    }

    if (this.passwordForm.newPassword.length < 6) {
      this.error = 'New password must be at least 6 characters long';
      setTimeout(() => this.error = '', 5000);
      return false;
    }

    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.error = 'New passwords do not match';
      setTimeout(() => this.error = '', 5000);
      return false;
    }

    return true;
  }

  validateCredentialsForm(): boolean {
    if (!this.credentialsForm.bearerToken && !this.credentialsForm.apiKey) {
      this.error = 'At least Bearer Token or API Key is required';
      setTimeout(() => this.error = '', 5000);
      return false;
    }

    if (this.credentialsForm.apiKey) {
      if (!this.credentialsForm.apiSecret || !this.credentialsForm.accessToken || !this.credentialsForm.accessTokenSecret) {
        this.error = 'If API Key is provided, all advanced credentials are required';
        setTimeout(() => this.error = '', 5000);
        return false;
      }
    }

    if (this.credentialsForm.expiresAt) {
      const expiryDate = new Date(this.credentialsForm.expiresAt);
      if (expiryDate <= new Date()) {
        this.error = 'Expiry date must be in the future';
        setTimeout(() => this.error = '', 5000);
        return false;
      }
    }

    return true;
  }

  clearCredentialsForm() {
    this.credentialsForm = {
      bearerToken: '',
      apiKey: '',
      apiSecret: '',
      accessToken: '',
      accessTokenSecret: '',
      expiresAt: ''
    };
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
    this.error = '';
    this.success = '';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getCredentialStatus(): string {
    if (!this.credentialsInfo?.configured) return 'Not Configured';
    if (this.credentialsInfo.isExpired) return 'Expired';
    if (!this.credentialsInfo.isActive) return 'Inactive';
    return 'Active';
  }

  getCredentialStatusColor(): string {
    if (!this.credentialsInfo?.configured) return '#6c757d';
    if (this.credentialsInfo.isExpired) return '#dc3545';
    if (!this.credentialsInfo.isActive) return '#ffc107';
    return '#28a745';
  }

  // Session Management Methods
  async loadUserSessions() {
    this.sessionsLoading = true;
    try {
      const headers = this.authService.getAuthHeaders();
      const response = await this.http.get<{success: boolean, sessions: UserSession[], total: number}>(`${this.apiUrl}/sessions`, { headers }).toPromise();
      
      if (response?.success) {
        this.userSessions = response.sessions || [];
      }
    } catch (error) {
      console.error('Error loading user sessions:', error);
      this.error = 'Failed to load sessions';
    }
    this.sessionsLoading = false;
  }

  async refreshSessions() {
    await this.loadUserSessions();
    this.success = 'Sessions refreshed successfully';
    setTimeout(() => this.success = '', 3000);
  }

  async revokeSession(sessionId: string) {
    if (!confirm('Are you sure you want to revoke this session?')) return;
    
    this.sessionsLoading = true;
    try {
      const headers = this.authService.getAuthHeaders();
      const response = await this.http.delete<{success: boolean, message: string}>(`${this.apiUrl}/sessions/${sessionId}`, { headers }).toPromise();
      
      if (response?.success) {
        this.success = response.message;
        await this.loadUserSessions();
      }
    } catch (error) {
      console.error('Error revoking session:', error);
      this.error = 'Failed to revoke session';
    }
    this.sessionsLoading = false;
    setTimeout(() => this.success = '', 3000);
  }

  async revokeOtherSessions() {
    if (!confirm('Are you sure you want to revoke all other sessions? You will remain logged in on this device.')) return;
    
    this.sessionsLoading = true;
    try {
      const headers = this.authService.getAuthHeaders();
      const response = await this.http.delete<{success: boolean, message: string, revokedCount: number}>(`${this.apiUrl}/sessions`, { headers }).toPromise();
      
      if (response?.success) {
        this.success = response.message;
        await this.loadUserSessions();
      }
    } catch (error) {
      console.error('Error revoking other sessions:', error);
      this.error = 'Failed to revoke other sessions';
    }
    this.sessionsLoading = false;
    setTimeout(() => this.success = '', 3000);
  }

  trackSession(index: number, session: UserSession): string {
    return session.id;
  }
}
