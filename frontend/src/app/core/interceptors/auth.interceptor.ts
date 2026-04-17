import { HttpInterceptorFn, HttpErrorResponse, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError, Observable, of, BehaviorSubject, filter, take } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

// Controle de refresh concorrente — se múltiplas requests caem em 401 ao
// mesmo tempo, só UMA dispara o refresh; as outras esperam.
let refreshing = false;
const refreshed$ = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // Só injeta Authorization em chamadas da nossa API, não em CDNs, /media/, etc.
  const isOurApi = req.url.startsWith(environment.apiUrl) || req.url.startsWith('/api/');

  const withAuth = (token: string | null) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  const token = isOurApi ? localStorage.getItem('access_token') : null;
  const attempted = withAuth(token);

  return next(attempted).pipe(
    catchError((err: HttpErrorResponse) => {
      // Só tenta refresh em 401 vindo da nossa API, e que não seja a própria
      // rota de login/refresh (evita loop).
      const isAuthEndpoint =
        req.url.includes('/auth/login') || req.url.includes('/auth/token/refresh');
      if (!isOurApi || err.status !== 401 || isAuthEndpoint) {
        return throwError(() => err);
      }

      if (refreshing) {
        // Outra request já está refreshando — espera o resultado
        return refreshed$.pipe(
          filter(t => t !== null),
          take(1),
          switchMap(newToken => next(withAuth(newToken!)))
        );
      }

      refreshing = true;
      refreshed$.next(null);

      return auth.refresh().pipe(
        switchMap(newToken => {
          refreshing = false;
          refreshed$.next(newToken);
          return next(withAuth(newToken));
        }),
        catchError(refreshErr => {
          refreshing = false;
          refreshed$.next(null);
          auth.logout();
          return throwError(() => refreshErr);
        })
      );
    })
  );
};
