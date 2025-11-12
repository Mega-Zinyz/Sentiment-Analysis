import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

interface UserStats {
  id: number;
  username: string;
  email: string;
  role: string;
  created_at: string;
  is_active: boolean;
  analysis_count?: number;
  last_login?: string;
}

interface SystemStats {
  totalUsers: number;
  totalAnalyses: number;
  totalWordLibraries: number;
  recentActivity: any[];
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  private apiUrl = environment.apiUrl;
  
  users: UserStats[] = [];
  systemStats: SystemStats = {
    totalUsers: 0,
    totalAnalyses: 0,
    totalWordLibraries: 0,
    recentActivity: []
  };

  loading = false;
  error = '';
  success = '';

  // Filters and pagination
  searchTerm = '';
  selectedRole = '';
  currentPage = 1;
  itemsPerPage = 10;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadSystemStats();
    this.loadUsers();
  }

  async loadSystemStats() {
    try {
      const headers = this.authService.getAuthHeaders();
      const stats = await this.http.get<SystemStats>(`${this.apiUrl}/admin/stats`, { headers }).toPromise();
      if (stats) {
        this.systemStats = stats;
      }
    } catch (error) {
      console.error('Error loading system stats:', error);
    }
  }

  async loadUsers() {
    this.loading = true;
    try {
      const headers = this.authService.getAuthHeaders();
      const response = await this.http.get<{users: UserStats[]}>(`${this.apiUrl}/admin/users`, { headers }).toPromise();
      if (response) {
        this.users = response.users;
      }
    } catch (error) {
      console.error('Error loading users:', error);
      this.error = 'Failed to load users';
    }
    this.loading = false;
  }

  async toggleUserStatus(userId: number, isActive: boolean) {
    try {
      const headers = this.authService.getAuthHeaders();
      await this.http.put(`${this.apiUrl}/admin/users/${userId}/status`, {
        isActive: !isActive
      }, { headers }).toPromise();
      
      this.success = `User ${!isActive ? 'activated' : 'deactivated'} successfully`;
      setTimeout(() => this.success = '', 3000);
      
      await this.loadUsers();
    } catch (error) {
      console.error('Error toggling user status:', error);
      this.error = 'Failed to update user status';
      setTimeout(() => this.error = '', 3000);
    }
  }

  onRoleChange(event: Event, userId: number) {
    const target = event.target as HTMLSelectElement;
    if (target && target.value) {
      this.changeUserRole(userId, target.value);
    }
  }

  async changeUserRole(userId: number, newRole: string) {
    try {
      const headers = this.authService.getAuthHeaders();
      await this.http.put(`${this.apiUrl}/admin/users/${userId}/role`, {
        role: newRole
      }, { headers }).toPromise();
      
      this.success = `User role updated to ${newRole}`;
      setTimeout(() => this.success = '', 3000);
      
      await this.loadUsers();
    } catch (error) {
      console.error('Error changing user role:', error);
      this.error = 'Failed to update user role';
      setTimeout(() => this.error = '', 3000);
    }
  }

  async deleteUser(userId: number, username: string) {
    if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const headers = this.authService.getAuthHeaders();
      await this.http.delete(`${this.apiUrl}/admin/users/${userId}`, { headers }).toPromise();
      
      this.success = `User "${username}" deleted successfully`;
      setTimeout(() => this.success = '', 3000);
      
      await this.loadUsers();
      await this.loadSystemStats();
    } catch (error) {
      console.error('Error deleting user:', error);
      this.error = 'Failed to delete user';
      setTimeout(() => this.error = '', 3000);
    }
  }

  get filteredUsers(): UserStats[] {
    let filtered = this.users;

    // Search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(user => 
        user.username.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
      );
    }

    // Role filter
    if (this.selectedRole) {
      filtered = filtered.filter(user => user.role === this.selectedRole);
    }

    return filtered;
  }

  get paginatedUsers(): UserStats[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    return this.filteredUsers.slice(start, end);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredUsers.length / this.itemsPerPage);
  }

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  refresh() {
    this.loadSystemStats();
    this.loadUsers();
  }
}
