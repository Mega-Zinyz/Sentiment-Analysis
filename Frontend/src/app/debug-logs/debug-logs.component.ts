import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-debug-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './debug-logs.component.html',
  styleUrls: ['./debug-logs.component.css']
})
export class DebugLogsComponent implements OnInit {
  lines: string[] = [];
  loading = false;
  error: string | null = null;
  n = 100;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.loading = true;
    this.error = null;

    // The frontend should send Authorization header automatically via existing auth interceptor.
    this.http.get<{ lines: string[] }>(`/api/debug/failed-tweets?n=${this.n}`)
      .subscribe(
        resp => {
          this.lines = resp.lines || [];
          this.loading = false;
        },
        err => {
          this.error = err?.error?.error || err?.message || 'Failed to load debug logs';
          this.loading = false;
        }
      );
  }

  refresh() { this.load(); }

}
