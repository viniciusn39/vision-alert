import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-shell">
      <!-- Left panel -->
      <div class="auth-left">
        <div class="auth-left-inner">
          <div class="al-logo">
            <img src="assets/icons/icon.svg" width="28" height="28" style="filter: brightness(0) invert(1);">
          </div>
          <h1 class="al-title">VisionAlert</h1>
          <p class="al-tagline">Monitoramento inteligente<br>com câmeras e IA</p>

          <div class="al-features">
            <div class="al-feat"><span>✓</span> Detecção em tempo real</div>
            <div class="al-feat"><span>✓</span> Alertas via Telegram e e-mail</div>
            <div class="al-feat"><span>✓</span> Múltiplas câmeras por tenant</div>
            <div class="al-feat"><span>✓</span> Dashboard e histórico completo</div>
          </div>
        </div>
        <div class="al-bottom">
          <a routerLink="/admin" class="portal-link">Área administrativa</a>
          <span>·</span>
          <a routerLink="/partner" class="portal-link">Área da revenda</a>
        </div>
      </div>

      <!-- Right panel -->
      <div class="auth-right">
        <div class="auth-card">
          <div class="ac-header">
            <h2>Bem-vindo de volta</h2>
            <p>Entre com suas credenciais para continuar</p>
          </div>

          <form (ngSubmit)="submit()">
            <div class="form-group">
              <label>E-mail</label>
              <input type="email" [(ngModel)]="email" name="email"
                     placeholder="seu&#64;email.com" required autofocus />
            </div>
            <div class="form-group">
              <label>Senha</label>
              <input type="password" [(ngModel)]="password" name="password"
                     placeholder="••••••••" required />
            </div>
            @if (error()) {
              <div class="auth-error">{{ error() }}</div>
            }
            <button type="submit" class="btn primary submit-btn" [disabled]="loading()">
              @if (loading()) {
                <div class="spinner" style="width:16px;height:16px;border-width:2px;border-top-color:#fff"></div>
                <span>Entrando...</span>
              } @else {
                <span>Entrar</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              }
            </button>
          </form>

          <div class="ac-footer">
            Não tem conta? <a routerLink="/register">Criar conta grátis</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .auth-shell {
      min-height: 100vh;
      display: flex;
    }

    /* LEFT */
    .auth-left {
      width: 420px;
      flex-shrink: 0;
      background: linear-gradient(160deg, #0F6E56 0%, #1D9E75 50%, #22c55e 100%);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 48px 44px;
      color: white;
    }
    .auth-left-inner { flex: 1; display: flex; flex-direction: column; justify-content: center; }
    .al-logo {
      width: 56px; height: 56px; border-radius: 16px;
      background: rgba(255,255,255,.2);
      backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 24px;
      border: 1px solid rgba(255,255,255,.25);
    }
    .al-title { font-size: 30px; font-weight: 800; letter-spacing: -.5px; margin-bottom: 10px; }
    .al-tagline { font-size: 15px; opacity: .85; line-height: 1.6; margin-bottom: 36px; }
    .al-features { display: flex; flex-direction: column; gap: 12px; }
    .al-feat { display: flex; align-items: center; gap: 10px; font-size: 13.5px; opacity: .9;
      span { width: 20px; height: 20px; border-radius: 50%; background: rgba(255,255,255,.25); display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
    }
    .al-bottom { display: flex; align-items: center; gap: 10px; font-size: 12px; opacity: .7;
      span { opacity: .5; }
    }
    .portal-link { color: white; opacity: .8; &:hover { opacity: 1; } }

    /* RIGHT */
    .auth-right {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      padding: 40px 24px;
    }
    .auth-card {
      width: 100%;
      max-width: 400px;
      background: white;
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 8px 40px rgba(0,0,0,.08), 0 2px 8px rgba(0,0,0,.04);
      border: 1px solid rgba(0,0,0,.06);
    }
    .ac-header { margin-bottom: 28px;
      h2 { font-size: 22px; font-weight: 700; letter-spacing: -.3px; margin-bottom: 5px; color: #0f172a; }
      p { font-size: 13px; color: #64748b; }
    }
    .auth-error {
      background: #fff1f1; border: 1px solid #fecaca; border-radius: 8px;
      padding: 10px 14px; font-size: 13px; color: #991b1b; margin-bottom: 16px;
      display: flex; align-items: center; gap: 8px;
    }
    .submit-btn {
      width: 100%; justify-content: center; padding: 11px 20px;
      font-size: 14px; font-weight: 600; gap: 8px;
      border-radius: 9px;
    }
    .ac-footer { text-align: center; margin-top: 22px; font-size: 13px; color: #64748b;
      a { color: #1D9E75; font-weight: 600; &:hover { text-decoration: underline; } }
    }

    @media (max-width: 700px) {
      .auth-shell { flex-direction: column; }
      .auth-left { width: 100%; min-height: 220px; padding: 32px 28px; }
      .auth-left-inner { justify-content: flex-start; }
      .al-features { display: none; }
    }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);
  email = ''; password = '';
  loading = signal(false);
  error   = signal('');

  submit() {
    this.loading.set(true); this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.auth.redirectByRole(),
      error: () => { this.error.set('E-mail ou senha incorretos.'); this.loading.set(false); }
    });
  }
}
