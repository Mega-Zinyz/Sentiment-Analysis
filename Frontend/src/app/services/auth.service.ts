import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl.replace('/api', ''); // Remove /api suffix since auth service adds endpoints directly
  private currentUserSubject: BehaviorSubject<User | null>;
  public currentUser: Observable<User | null>;

  constructor(private http: HttpClient) {
    const storedUser = localStorage.getItem('currentUser');
    this.currentUserSubject = new BehaviorSubject<User | null>(
      storedUser ? JSON.parse(storedUser) : null
    );
    this.currentUser = this.currentUserSubject.asObservable();
  }

  public get currentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  public get isAuthenticated(): boolean {
    return !!this.getToken();
  }

  public get userRole(): string | null {
    const user = this.currentUserValue;
    return user ? user.role : null;
  }

  public get isAdmin(): boolean {
    return this.userRole === 'admin';
  }

  register(username: string, email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/register`, {
      username,
      email,
      password
    }).pipe(
      map(response => {
        // Store user details and token in local storage
        localStorage.setItem('currentUser', JSON.stringify(response.user));
        localStorage.setItem('token', response.token);
        this.currentUserSubject.next(response.user);
        return response;
      })
    );
  }

  login(username: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/login`, {
      username,
      password
    }).pipe(
      map(response => {
        // Store user details and token in local storage
        localStorage.setItem('currentUser', JSON.stringify(response.user));
        localStorage.setItem('token', response.token);
        this.currentUserSubject.next(response.user);
        return response;
      })
    );
  }

  logout(): Observable<any> {
    const token = this.getToken();
    
    // Always clear local storage regardless of server response
    const clearStorage = () => {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('token');
      this.currentUserSubject.next(null);
    };
    
    if (!token) {
      // If no token, just clear storage and return success
      clearStorage();
      return of({ success: true });
    }
    
    return this.http.post(`${this.apiUrl}/api/auth/logout`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).pipe(
      map(response => {
        clearStorage();
        return response;
      }),
      // If server request fails, still clear storage locally
      catchError((error: any) => {
        console.warn('Logout request failed, but clearing local storage:', error);
        clearStorage();
        return of({ success: true, message: 'Logged out locally' });
      })
    );
  }

  getProfile(): Observable<{ user: User }> {
    return this.http.get<{ user: User }>(`${this.apiUrl}/api/auth/profile`);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getAuthHeaders(): { [key: string]: string } {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  // Check if token is expired (basic check)
  isTokenExpired(): boolean {
    const token = this.getToken();
    if (!token) return true;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp < currentTime;
    } catch {
      return true;
    }
  }

  // Auto logout if token is expired
  checkTokenExpiration(): void {
    if (this.isTokenExpired()) {
      this.logout().subscribe();
    }
  }
}
