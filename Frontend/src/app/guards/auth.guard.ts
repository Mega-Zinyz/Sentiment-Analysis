import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

export const AuthGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.currentUser.pipe(
    take(1),
    map(user => {
      // If user is authenticated and token is not expired
      if (user && !authService.isTokenExpired()) {
        return true;
      }

      // Clear any invalid token
      authService.logout().subscribe();
      
      // Not logged in or token expired, redirect to login
      router.navigate(['/login']);
      return false;
    })
  );
};

// This AdminGuard is deprecated - use the one in admin.guard.ts instead
