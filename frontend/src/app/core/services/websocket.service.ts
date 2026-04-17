import { Injectable, NgZone } from '@angular/core';
import { Subject, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
export interface WsAlert { id:number; rule_name:string; severity:string; behavior:string; camera_name:string; camera_location:string; description:string; triggered_at:string; status:string; }
@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private ws: WebSocket | null = null;
  private alertSubject = new Subject<WsAlert>();
  public alerts$ = this.alertSubject.asObservable();
  private retries = 0; private intentionalClose = false;
  constructor(private zone: NgZone) {}
  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.intentionalClose = false;
    const token = localStorage.getItem('access_token');
    const url = `${environment.wsUrl}/alerts/${token ? '?token=' + token : ''}`;
    try { this.ws = new WebSocket(url); } catch { this.reconnect(); return; }
    this.ws.onopen    = () => { this.retries = 0; };
    this.ws.onmessage = (e) => { try { this.zone.run(() => this.alertSubject.next(JSON.parse(e.data))); } catch {} };
    this.ws.onclose   = () => { if (!this.intentionalClose) this.reconnect(); };
    this.ws.onerror   = () => this.ws?.close();
  }
  private reconnect() { if (this.retries >= 10) return; timer(Math.min(1000 * 2 ** this.retries++, 30000)).subscribe(() => this.connect()); }
  disconnect() { this.intentionalClose = true; this.ws?.close(); }
}
