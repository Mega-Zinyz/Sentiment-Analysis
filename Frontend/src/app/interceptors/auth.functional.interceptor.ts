import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Don't add auth headers to login/register/logout requests
  const isAuthRequest = req.url.includes('/auth/login') || 
                       req.url.includes('/auth/register') || 
                       req.url.includes('/api/check-credentials') ||
                       req.url.includes('/credentials-status');
  
  // Add authorization header with token if available and not an auth request
  const token = authService.getToken();
  let authReq = req;
  
  if (token && !authService.isTokenExpired() && !isAuthRequest) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        // Auto logout if 401 response returned from api
        authService.logout().subscribe(() => {
          router.navigate(['/login']);
        });
      }
      return throwError(() => error);
    })
  );
};