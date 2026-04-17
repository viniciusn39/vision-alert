import { Component, Input, Output, EventEmitter, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../../core/services/api.service';
import { Camera } from '../../../../core/models/models';

@Component({
  selector: 'app-camera-live',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="modal-backdrop" (click)="close.emit()">
  <div class="modal" style="max-width:760px;padding:0;overflow:hidden" (click)="$event.stopPropagation()">
    <div class="modal-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="live-dot live-active"></div>
        <div>
          <h3 style="margin:0">{{ camera.name }}</h3>
          <p style="font-size:11px;color:var(--muted);margin:0">{{ camera.location }} · ao vivo</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:11px;background:#7c3aed;color:#fff;padding:2px 8px;border-radius:99px;font-weight:600">IA AO VIVO</span>
        <button class="btn ghost sm" (click)="close.emit()" style="font-size:16px">✕</button>
      </div>
    </div>

    <div style="background:#000;position:relative;min-height:360px;display:flex;align-items:center;justify-content:center">
      @if (loading()) {
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;color:#fff">
          <div class="spinner" style="border-color:rgba(255,255,255,.2);border-top-color:#fff;width:32px;height:32px"></div>
          <span style="font-size:13px">Conectando ao stream...</span>
        </div>
      }
      @if (streamUrl()) {
        <img [src]="streamUrl()" style="width:100%;max-height:500px;object-fit:contain;display:block"
             (load)="loading.set(false)"
             (error)="onError()"/>
      }
      @if (error()) {
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;color:#fff;padding:40px">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.5"><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
          <span style="font-size:13px;opacity:.6">{{ errorMsg() || 'Câmera offline ou sem sinal' }}</span>
        </div>
      }
    </div>

    <div style="padding:12px 20px;background:var(--bg);display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;gap:16px;font-size:12px;color:var(--muted)">
        <span>🟢 Pessoas detectadas em verde</span>
        <span>🟡 Linha de contagem em amarelo</span>
      </div>
      <button class="btn sm primary" (click)="close.emit()">Fechar</button>
    </div>
  </div>
</div>
  `
})
export class CameraLiveComponent implements OnInit {
  @Input({ required: true }) camera!: Camera;
  @Output() close = new EventEmitter<void>();

  private api = inject(ApiService);

  loading = signal(true);
  streamUrl = signal<string | null>(null);
  error = signal(false);
  errorMsg = signal<string | null>(null);

  ngOnInit() {
    // Pede um stream-token curto (60s) — evita trafegar o JWT de sessão
    // em query string do <img>.
    this.api.requestStreamToken(this.camera.id).subscribe({
      next: (res) => {
        this.streamUrl.set(this.api.getCameraStreamUrl(this.camera.id, res.token));
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(true);
        if (err?.status === 429) {
          this.errorMsg.set('Muitos streams simultâneos. Feche algum e tente novamente.');
        } else if (err?.status === 403 || err?.status === 401) {
          this.errorMsg.set('Sem permissão para esta câmera.');
        } else {
          this.errorMsg.set('Não foi possível iniciar o stream.');
        }
      }
    });
  }

  onError() {
    this.loading.set(false);
    this.error.set(true);
    this.streamUrl.set(null);
  }
}
