import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { AuthService } from '../services/auth.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, HeaderComponent, FooterComponent],
  template: `
    <div class="app-layout">
      <app-header *ngIf="showHeader"></app-header>
      <main class="main-content" [class.full-height]="!showHeader" [class.with-container]="showHeader">
        <ng-content></ng-content>
      </main>
      <app-footer *ngIf="showFooter"></app-footer>
    </div>
  `,
  styles: [`
    .app-layout {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    
    .main-content.full-height {
      min-height: 100vh;
    }
    
    .main-content.with-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      width: 100%;
    }
    
    @media (max-width: 768px) {
      .main-content.with-container {
        padding: 15px;
      }
    }
  `]
})
export class LayoutComponent implements OnInit {
  showHeader = true;
  showFooter = true;

  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Hide header/footer on login and register pages
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      const hideHeaderFooterRoutes = ['/login', '/register'];
      const currentRoute = event.url.split('?')[0]; // Remove query parameters
      
      this.showHeader = !hideHeaderFooterRoutes.includes(currentRoute);
      this.showFooter = !hideHeaderFooterRoutes.includes(currentRoute);
    });

    // Check initial route
    const currentRoute = this.router.url.split('?')[0];
    const hideHeaderFooterRoutes = ['/login', '/register'];
    this.showHeader = !hideHeaderFooterRoutes.includes(currentRoute);
    this.showFooter = !hideHeaderFooterRoutes.includes(currentRoute);
  }
}
