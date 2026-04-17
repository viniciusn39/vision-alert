import { Component, Input, Output, EventEmitter, signal, computed, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../../core/services/api.service';
import { Camera } from '../../../../core/models/models';

@Component({
  selector: 'app-camera-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="modal-backdrop" (click)="close.emit()">
  <div class="modal" style="max-width:800px" (click)="$event.stopPropagation()">
    <div class="modal-header">
      <div>
        <h3>{{ camera.name }}</h3>
        <p style="font-size:12px;color:var(--muted);margin-top:2px">{{ camera.location }} · {{ camera.protocol?.toUpperCase() }}</p>
      </div>
      <button class="btn ghost sm" (click)="close.emit()" style="font-size:16px;padding:4px 8px">✕</button>
    </div>

    @if (loading()) {
      <div class="loading"><div class="spinner"></div></div>
    } @else {
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">
        <div class="dash-kpi">
          <div class="dk-val" style="color:var(--critical)">{{ stats().total }}</div>
          <div class="dk-label">Total alertas</div>
        </div>
        <div class="dash-kpi">
          <div class="dk-val" style="color:var(--critical)">{{ stats().open }}</div>
          <div class="dk-label">Em aberto</div>
        </div>
        <div class="dash-kpi">
          <div class="dk-val" style="color:var(--high)">{{ stats().critical }}</div>
          <div class="dk-label">Críticos</div>
        </div>
        <div class="dash-kpi">
          <div class="dk-val" style="color:var(--primary)">{{ stats().resolved }}</div>
          <div class="dk-label">Resolvidos</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">Regras aplicadas ({{ detail()?.rules?.length || 0 }})</div>
          @if (!detail()?.rules?.length) {
            <div style="padding:16px;text-align:center;font-size:12px;color:var(--muted);background:var(--bg);border-radius:var(--r-sm)">Nenhuma regra associada a esta câmera</div>
          } @else {
            <div style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto">
              @for (r of detail()!.rules; track r.id) {
                <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg);border-radius:var(--r-sm);border:1px solid var(--border)">
                  <div style="width:6px;height:6px;border-radius:50%;flex-shrink:0" [style.background]="sevColor(r.severity)"></div>
                  <div style="flex:1;font-size:12px;font-weight:500">{{ r.name }}</div>
                  <span style="font-size:10px;color:var(--muted)">{{ r.cooldown_seconds }}s cooldown</span>
                  <div style="width:6px;height:6px;border-radius:50%" [style.background]="r.is_active ? 'var(--primary)' : '#cbd5e1'"></div>
                </div>
              }
            </div>
          }
        </div>

        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">Métricas — 24h</div>
          @if (!detail()?.metrics || !objectKeys(detail()!.metrics).length) {
            <div style="padding:16px;text-align:center;font-size:12px;color:var(--muted);background:var(--bg);border-radius:var(--r-sm)">Sem métricas registradas ainda</div>
          } @else {
            <div style="display:flex;flex-direction:column;gap:6px">
              @for (key of objectKeys(detail()!.metrics); track key) {
                <div style="padding:10px;background:var(--bg);border-radius:var(--r-sm);border:1px solid var(--border)">
                  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                    <span style="font-weight:600;text-transform:capitalize">{{ metricLabel(key) }}</span>
                    <span style="color:var(--primary);font-weight:700">máx: {{ detail()!.metrics[key].max }}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted)">
                    <span>média: {{ detail()!.metrics[key].avg }}</span>
                    <span>{{ detail()!.metrics[key].count }} registros</span>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Últimos alertas</div>
      @if (!alerts().length) {
        <div class="empty" style="padding:16px"><div class="empty-icon">✅</div><p>Nenhum alerta recente</p></div>
      } @else {
        <div style="display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto">
          @for (a of alerts(); track a.id) {
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-radius:var(--r-sm);border:1px solid var(--border)">
              <div style="width:7px;height:7px;border-radius:50%;flex-shrink:0" [style.background]="sevColor(a['rule__severity'])"></div>
              <div style="flex:1">
                <div style="font-size:12px;font-weight:600">{{ a['rule__name'] }}</div>
                <div style="font-size:11px;color:var(--muted)">{{ a.description }}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:10px;color:var(--muted)">{{ fmtDate(a.triggered_at) }}</div>
                <span [class]="'badge '+a.status" style="font-size:10px">{{ a.status }}</span>
              </div>
            </div>
          }
        </div>
      }
    }

    <div class="modal-footer" style="border-top:1px solid var(--border);padding-top:12px;margin-top:16px">
      <span style="font-size:12px;color:var(--hint)">{{ alerts().length }} alertas · {{ detail()?.rules?.length || 0 }} regras</span>
      <button class="btn sm primary" (click)="close.emit()">Fechar</button>
    </div>
  </div>
</div>
  `
})
export class CameraDashboardComponent implements OnInit {
  @Input({ required: true }) camera!: Camera;
  @Output() close = new EventEmitter<void>();

  private api = inject(ApiService);

  loading = signal(true);
  detail = signal<any>(null);
  alerts = signal<any[]>([]);

  stats = computed(() => {
    const a = this.alerts();
    return {
      total: a.length,
      open: a.filter(x => x.status === 'open').length,
      critical: a.filter(x => x.rule_severity === 'critical' || x['rule__severity'] === 'critical').length,
      resolved: a.filter(x => x.status === 'resolved').length,
    };
  });

  ngOnInit() {
    this.api.getCameraDetail(this.camera.id).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.alerts.set(d.recent_alerts ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.api.getAlerts({ camera: String(this.camera.id), ordering: '-triggered_at', page_size: '50' }).subscribe((r: any) => {
          this.alerts.set(Array.isArray(r) ? r : (r.results ?? []));
          this.loading.set(false);
        });
      }
    });
  }

  objectKeys(obj: any) { return obj ? Object.keys(obj) : []; }

  metricLabel(key: string): string {
    const m: Record<string, string> = {
      people_count: 'Contagem de pessoas', queue_size: 'Tamanho da fila',
      vehicle_count: 'Contagem de veículos', motion_score: 'Nível de movimento'
    };
    return m[key] ?? key;
  }

  sevColor(s: string): string {
    return ({ critical: 'var(--critical)', high: 'var(--high)', medium: 'var(--medium)', low: 'var(--low)' } as any)[s] ?? '#999';
  }

  fmtDate(d: string) {
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
}
