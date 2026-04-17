import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../../core/services/api.service';
import { Camera } from '../../../../core/models/models';

@Component({
  selector: 'app-camera-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="modal-backdrop" (click)="closeModal($event)">
  <div class="modal" (click)="$event.stopPropagation()">
    <div class="modal-header">
      <div>
        <h3>{{ editing ? 'Editar câmera' : 'Nova câmera' }}</h3>
        <p style="font-size:12px;color:var(--muted);margin-top:2px">{{ editing ? 'Altere as configurações' : 'Configure uma nova fonte de vídeo' }}</p>
      </div>
      <button class="btn ghost sm" (click)="cancel.emit()" style="font-size:16px;padding:4px 8px">✕</button>
    </div>
    <div class="row-2">
      <div class="form-group"><label>Nome *</label><input [(ngModel)]="form.name" placeholder="Ex: Câmera da Entrada"/></div>
      <div class="form-group"><label>Localização</label><input [(ngModel)]="form.location" placeholder="Portaria, Sala..."/></div>
    </div>
    <div class="form-group">
      <label>Protocolo</label>
      <select [(ngModel)]="form.protocol">
        <option value="rtsp">RTSP — câmeras IP / DVR / NVR</option>
        <option value="http">HTTP / MJPEG</option>
        <option value="local">Webcam local (USB)</option>
        <option value="file">Arquivo de vídeo</option>
        <option value="youtube">▶ YouTube</option>
      </select>
    </div>
    <div class="form-group">
      <label>URL / Endereço *</label>
      @if (form.protocol === 'file') {
        <div class="upload-zone" (click)="fileInput.click()" [class.uploading]="uploading()">
          <input #fileInput type="file" accept=".mp4,.avi,.mov,.mkv,.webm" style="display:none" (change)="onFileSelected($event)"/>
          @if (uploading()) {
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
              <div class="spinner"></div>
              <span style="font-size:12px;color:var(--muted)">Enviando vídeo...</span>
            </div>
          } @else if (form.url) {
            <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
              <span style="font-size:12px;color:var(--primary);font-weight:500">{{ uploadedName || form.url }}</span>
              <span style="font-size:11px;color:var(--hint)">Clique para trocar</span>
            </div>
          } @else {
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--hint)" stroke-width="1.5"><polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
              <span style="font-size:13px;color:var(--muted);font-weight:500">Clique para fazer upload</span>
              <span style="font-size:11px;color:var(--hint)">MP4, AVI, MOV, MKV — máx. 500MB</span>
            </div>
          }
        </div>
      } @else if (form.protocol === 'youtube') {
        <div class="yt-input-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.5A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
          <input [(ngModel)]="youtubeUrl" placeholder="https://www.youtube.com/watch?v=..." style="flex:1;border:none;outline:none;font-size:13px;background:transparent"/>
          <button class="btn sm primary" (click)="downloadYoutube()" [disabled]="downloading()" style="flex-shrink:0">
            @if (downloading()) { <div class="spinner" style="width:12px;height:12px;border-width:2px;border-top-color:#fff"></div> Baixando... }
            @else { Baixar }
          </button>
        </div>
        @if (form.url) {
          <div style="margin-top:8px;font-size:12px;color:var(--primary);display:flex;align-items:center;gap:6px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>
            Vídeo baixado com sucesso!
          </div>
        }
      } @else {
        <input [(ngModel)]="form.url" [placeholder]="urlPh()"/>
      }
      @if (urlHint() && form.protocol !== 'file' && form.protocol !== 'youtube') { <small>{{ urlHint() }}</small> }
    </div>
    @if (form.protocol !== 'local' && form.protocol !== 'file') {
      <div class="row-2">
        <div class="form-group"><label>Usuário</label><input [(ngModel)]="form.username" placeholder="admin"/></div>
        <div class="form-group"><label>Senha</label><input type="password" [(ngModel)]="form.password" placeholder="••••••"/></div>
      </div>
    }
    <div class="form-group">
      <label>Estabelecimento <span style="font-weight:400;color:var(--hint)">(opcional)</span></label>
      <select [(ngModel)]="form.location_obj">
        <option [ngValue]="null">Nenhum</option>
        @for (loc of locations; track loc.id) {
          <option [ngValue]="loc.id">{{ loc.name }}{{ loc.city ? ' — ' + loc.city : '' }}</option>
        }
      </select>
      <small>Vincula esta câmera a um estabelecimento para cruzar dados de fluxo</small>
    </div>

    <div class="form-group">
      <label>Linha de contagem de visitantes <span style="font-weight:400;color:var(--hint)">(opcional)</span></label>
      <div class="line-config" [class.line-active]="form.entry_line_y != null">
        <div class="line-preview" (click)="toggleEntryLine()">
          @if (form.entry_line_y != null) {
            <div class="line-indicator" [style.top.%]="form.entry_line_y * 100">
              <span class="line-label-left">ENTRADA</span>
              <div class="line-bar"></div>
              <span class="line-label-right">SAÍDA</span>
            </div>
            <div style="position:absolute;top:4px;right:4px;background:var(--primary);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px">ATIVA</div>
          } @else {
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:4px;color:var(--hint)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="15,7 20,12 15,17"/></svg>
              <span style="font-size:11px">Clique para ativar linha de contagem</span>
            </div>
          }
        </div>
        @if (form.entry_line_y != null) {
          <div style="margin-top:10px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span>Posição da linha</span>
              <strong>{{ (form.entry_line_y * 100).toFixed(0) }}% do topo</strong>
            </div>
            <input type="range" min="0.1" max="0.9" step="0.01" [(ngModel)]="form.entry_line_y" style="width:100%"/>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--hint)">
              <span>↑ Topo</span><span>Base ↓</span>
            </div>
            <small>Coloque a linha na porta de entrada. Pessoas cruzando para baixo = entrada, para cima = saída.</small>
            <button class="btn sm ghost" style="color:var(--critical);margin-top:8px" (click)="form.entry_line_y = null">✕ Remover linha</button>
          </div>
        }
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn" (click)="cancel.emit()">Cancelar</button>
      <button class="btn primary" (click)="save()" [disabled]="saving()">
        @if (saving()) { <div class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff"></div> }
        {{ saving() ? 'Salvando...' : 'Salvar câmera' }}
      </button>
    </div>
  </div>
</div>
  `
})
export class CameraFormComponent {
  @Input() editing: Camera | null = null;
  @Input() locations: any[] = [];
  @Output() saved = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  private api = inject(ApiService);

  form: any = {};
  saving = signal(false);
  uploading = signal(false);
  downloading = signal(false);
  uploadedName = '';
  youtubeUrl = '';

  ngOnInit() {
    this.form = this.editing ? { ...this.editing } : { protocol: 'rtsp', is_active: true };
  }

  closeModal(e: MouseEvent) { if (e.target === e.currentTarget) this.cancel.emit(); }

  toggleEntryLine() {
    if (this.form.entry_line_y != null) return;
    this.form.entry_line_y = 0.5;
  }

  onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.api.uploadVideo(file).subscribe({
      next: (res) => { this.form.url = res.path; this.uploadedName = res.filename; this.uploading.set(false); },
      error: (err) => { alert(err.error?.detail || 'Erro no upload'); this.uploading.set(false); }
    });
  }

  downloadYoutube() {
    if (!this.youtubeUrl) return;
    this.downloading.set(true);
    this.api.downloadYoutube(this.youtubeUrl).subscribe({
      next: (res) => { this.form.url = res.path; this.uploadedName = 'youtube_video.mp4'; this.downloading.set(false); },
      error: (err: any) => { alert(err.error?.detail || 'Erro ao baixar vídeo do YouTube'); this.downloading.set(false); }
    });
  }

  save() {
    if (!this.form.name || !this.form.url) return;
    this.saving.set(true);
    const req = this.editing
      ? this.api.updateCamera(this.editing.id, this.form)
      : this.api.createCamera(this.form);
    req.subscribe({
      next: () => { this.saved.emit(); this.saving.set(false); },
      error: () => this.saving.set(false)
    });
  }

  urlPh(): string {
    const m: any = { rtsp: 'rtsp://192.168.1.100:554/stream1', http: 'http://192.168.1.100/video', local: '0', file: '/videos/gravacao.mp4' };
    return m[this.form.protocol] ?? '';
  }

  urlHint(): string {
    const m: any = { local: 'Use 0 para webcam padrão, 1 para segunda câmera', file: 'Caminho absoluto do arquivo no servidor' };
    return m[this.form.protocol] ?? '';
  }
}
