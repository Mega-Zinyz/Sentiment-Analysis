import { Routes } from '@angular/router';

import { HomeComponent } from './home/home.component';
import { TrainDataComponent } from './train-data/train-data.component';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { AdminComponent } from './admin/admin.component';
import { AnalysisHistoryComponent } from './analysis-history/analysis-history.component';
import { AnalysisInsightsComponent } from './analysis-insights/analysis-insights.component';
import { ProfileComponent } from './profile/profile.component';
import { RawDataAnalysisComponent } from './raw-data-analysis/raw-data-analysis.component';
import { TweetCollectionComponent } from './tweet-collection/tweet-collection.component';
import { DebugLogsComponent } from './debug-logs/debug-logs.component';
import { AuthGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
	{ path: '', redirectTo: '/analysis', pathMatch: 'full' },
	{ path: 'home', component: HomeComponent, canActivate: [AuthGuard] },
	{ path: 'tweets', component: TweetCollectionComponent, canActivate: [AuthGuard] },
	{ path: 'analysis', component: RawDataAnalysisComponent, canActivate: [AuthGuard] },
	{ path: 'train-data', component: TrainDataComponent, canActivate: [AuthGuard] },
	{ path: 'analysis-history', component: AnalysisHistoryComponent, canActivate: [AuthGuard] },
	{ path: 'analysis-insights/:id', component: AnalysisInsightsComponent, canActivate: [AuthGuard] },
	{ path: 'profile', component: ProfileComponent, canActivate: [AuthGuard] },
	{ path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
	{ path: 'debug/logs', component: DebugLogsComponent, canActivate: [adminGuard] },
	{ path: 'login', component: LoginComponent },
	{ path: 'register', component: RegisterComponent },
	{ path: '**', redirectTo: '/login' }
];
