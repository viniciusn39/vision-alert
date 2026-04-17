import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthPayload } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private base = environment.apiUrl;

  private _token = signal<string | null>(localStorage.getItem('access_token'));
  private _payload = signal<AuthPayload | null>(this._decodeToken(localStorage.getItem('access_token')));

  isLoggedIn = computed(() => !!this._token());
  user = computed(() => this._payload());
  role = computed(() => this._payload()?.role ?? null);
  tenantId = computed(() => this._payload()?.tenant_id ?? null);
  partnerId = computed(() => this._payload()?.partner_id ?? null);

  get isSuperAdmin()   { return this.role() === 'superadmin'; }
  get isPartnerAdmin() { return this.role() === 'partner_admin'; }
  get isTenantAdmin()  { return this.role() === 'tenant_admin'; }
  get isTenantMember() { return ['tenant_admin', 'tenant_operator', 'tenant_viewer'].includes(this.role() ?? ''); }

  login(email: string, password: string) {
    return this.http.post<{ access: string; refresh: string }>(
      `${this.base}/auth/login/`, { email, password }
    ).pipe(tap(res => this._storeTokens(res.access, res.refresh)));
  }

  /**
   * Tenta renovar o access_token usando o refresh_token salvo.
   * Retorna Observable<string> com o novo access_token.
   * Se falhar, propaga o erro (o interceptor chama logout).
   */
  refresh(): Observable<string> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      throw new Error('No refresh token');
    }
    return this.http.post<{ access: string; refresh?: string }>(
      `${this.base}/auth/token/refresh/`, { refresh: refreshToken }
    ).pipe(
      tap(res => {
        // ROTATE_REFRESH_TOKENS=True no backend retorna um novo refresh também
        this._storeTokens(res.access, res.refresh ?? refreshToken);
      }),
      map(res => res.access)
    );
  }

  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this._token.set(null);
    this._payload.set(null);
    this.router.navigate(['/login']);
  }

  redirectByRole() {
    if (this.isSuperAdmin)      this.router.navigate(['/admin/dashboard']);
    else if (this.isPartnerAdmin) this.router.navigate(['/partner/dashboard']);
    else                         this.router.navigate(['/panel/dashboard']);
  }

  private _storeTokens(access: string, refresh: string) {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    this._token.set(access);
    this._payload.set(this._decodeToken(access));
  }

  private _decodeToken(token: string | null): AuthPayload | null {
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      // atob não trata base64url perfeitamente — normaliza
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b64));
    } catch {
      return null;
    }
  }
}
