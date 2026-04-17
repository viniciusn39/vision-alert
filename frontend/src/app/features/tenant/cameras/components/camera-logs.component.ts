import { Component, Input, Output, EventEmitter, signal, computed, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../../core/services/api.service';
import { Camera } from '../../../../core/models/models';

@Component({
  selector: 'app-camera-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="modal-backdrop" (click)="close.emit()">
  <div class="modal" style="max-width:720px;height:80vh;display:flex;flex-direction:column" (click)="$event.stopPropagation()">
    <div class="modal-header" style="flex-shrink:0">
      <div>
        <h3>Logs — {{ camera.name }}</h3>
        <p style="font-size:12px;color:var(--muted);margin-top:2px">Processamento em tempo real</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="live-dot" [class.live-active]="camera.is_active"></div>
        <span style="font-size:12px;color:var(--muted)">{{ camera.is_active ? 'Processando' : 'Parado' }}</span>
        <button class="btn ghost sm" (click)="close.emit()" style="font-size:16px;padding:4px 8px">✕</button>
      </div>
    </div>
    <div class="logs-toolbar" style="flex-shrink:0">
      <div class="log-level-tabs">
        <button class="llt" [class.llt-active]="level()==='all'" (click)="level.set('all')">Todos</button>
        <button class="llt llt-detect" [class.llt-active]="level()==='detect'" (click)="level.set('detect')">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>Detecções
        </button>
        <button class="llt llt-alert" [class.llt-active]="level()==='alert'" (click)="level.set('alert')">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 22,22 2,22"/></svg>Alertas
        </button>
      </div>
      <div class="search-box" style="flex:1">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input [(ngModel)]="filterText" placeholder="Buscar nos logs..."/>
        @if (filterText) { <button class="clear-btn" (click)="filterText=''">✕</button> }
      </div>
      <label class="log-autoscroll">
        <input type="checkbox" [checked]="autoScroll()" (change)="autoScroll.set($any($event.target).checked)"/>
        Auto-scroll
      </label>
      <button class="btn sm ghost" (click)="clearLogs()" style="color:var(--muted);padding:5px 10px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/></svg>
      </button>
    </div>
    <div class="logs-body">
      @if (filtered().length === 0) {
        <div style="text-align:center;padding:40px;color:var(--hint);font-size:13px">
          {{ camera.is_active ? 'Aguardando processamento...' : 'Câmera parada. Inicie para ver logs.' }}
        </div>
      }
      @for (log of filtered(); track log.id) {
        <div class="log-line" [class]="'log-'+log.type">
          <span class="log-time">{{ log.time }}</span>
          <span class="log-badge" [class]="'lb-'+log.type">{{ typeLabel(log.type) }}</span>
          <span class="log-msg">{{ log.msg }}</span>
        </div>
      }
    </div>
    <div class="modal-footer" style="flex-shrink:0;border-top:1px solid var(--border);padding-top:12px">
      <span style="font-size:12px;color:var(--hint)">{{ filtered().length }} entradas</span>
      <button class="btn sm primary" (click)="close.emit()">Fechar</button>
    </div>
  </div>
</div>
  `
})
export class CameraLogsComponent implements OnInit, OnDestroy {
  @Input({ required: true }) camera!: Camera;
  @Output() close = new EventEmitter<void>();

  private api = inject(ApiService);
  private interval: any = null;
  private idSeq = 0;

  level = signal<'all' | 'detect' | 'alert'>('all');
  autoScroll = signal(true);
  entries = signal<{ id: number; type: string; time: string; msg: string }[]>([]);
  filterText = '';

  filtered = computed(() => {
    let logs = this.entries();
    if (this.level() === 'detect') logs = logs.filter(l => l.type === 'detect');
    if (this.level() === 'alert') logs = logs.filter(l => l.type === 'alert');
    if (this.filterText) {
      const q = this.filterText.toLowerCase();
      logs = logs.filter(l => l.msg.toLowerCase().includes(q));
    }
    return logs;
  });

  ngOnInit() {
    this.addLog('info', `Câmera: ${this.camera.name} | Protocolo: ${this.camera.protocol?.toUpperCase()} | Status: ${this.camera.status}`);
    this.addLog('info', `URL: ${this.camera.url || '(não disponível)'}`);
    if (this.camera.is_active) {
      this.addLog('info', 'Monitoramento ativo — aguardando frames...');
      this.startPolling();
    } else {
      this.addLog('info', 'Câmera parada. Clique em Iniciar para começar o processamento.');
    }
  }

  ngOnDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  private startPolling() {
    this.interval = setInterval(() => {
      this.api.getAlerts({ camera: String(this.camera.id), ordering: '-triggered_at', page_size: '5' }).subscribe((r: any) => {
        const list = Array.isArray(r) ? r : (r.results ?? []);
        list.slice(0, 2).forEach((a: any) => {
          const exists = this.entries().find(l => l.msg.includes(`#${a.id}`));
          if (!exists) {
            this.addLog('alert', `🚨 ALERTA #${a.id} — ${a.rule_name} | Severidade: ${a.rule_severity} | ${a.description}`);
          }
        });
      });
    }, 3000);
  }

  addLog(type: string, msg: string) {
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.entries.update(l => [...l.slice(-200), { id: ++this.idSeq, type, time: now, msg }]);
  }

  clearLogs() { this.entries.set([]); }

  typeLabel(t: string): string {
    return ({ info: 'INFO', detect: 'DETECT', alert: 'ALERTA', error: 'ERRO' } as any)[t] ?? t;
  }
}
