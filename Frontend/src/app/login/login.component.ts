import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  username = '';
  password = '';
  loading = false;
  error = '';
  returnUrl = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    // Redirect to home if already logged in
    if (this.authService.currentUserValue) {
      this.router.navigate(['/']);
    }

    // Get return url from route parameters or default to '/home'
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/analysis';
  }

  onSubmit() {
    if (!this.username || !this.password) {
      this.error = 'Username and password are required';
      return;
    }

    this.loading = true;
    this.error = '';

    this.authService.login(this.username, this.password).subscribe({
      next: (response) => {
        // Clear loading/error and ensure auth state is updated before navigating
        this.loading = false;
        this.error = '';

        // Navigate after current call stack so subscribers receive the update
        setTimeout(() => this.router.navigate([this.returnUrl]), 0);
      },
      error: (error) => {
        console.error('Login error:', error);
        this.error = error.error?.error || 'Login failed. Please try again.';
        this.loading = false;
      }
    });
  }

  goToRegister() {
    this.router.navigate(['/register'], { 
      queryParams: { returnUrl: this.returnUrl } 
    });
  }
}
