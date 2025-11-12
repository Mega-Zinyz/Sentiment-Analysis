import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map } from 'rxjs/operators';

export const adminGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.currentUser.pipe(
    map(user => {
      // First check if user is authenticated
      if (!user || authService.isTokenExpired()) {
        authService.logout().subscribe();
        router.navigate(['/login']);
        return false;
      }
      
      // Then check if user is admin
      if (user.role === 'admin') {
        return true;
      } else {
        // User is authenticated but not admin, redirect to home
        router.navigate(['/home']);
        return false;
      }
    })
  );
};
