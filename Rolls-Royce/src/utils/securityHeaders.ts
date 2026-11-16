import { ServerResponse } from 'http';

/**
 * Generates a cryptographically secure random nonce for CSP
 * Uses crypto.getRandomValues for browser compatibility and Node.js crypto for server
 */
export function generateCSPNonce(): string {
  const array = new Uint8Array(16);
  
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else if (typeof require !== 'undefined') {
    // Node.js fallback
    const nodeCrypto = require('crypto');
    const buffer = nodeCrypto.randomBytes(16);
    array.set(buffer);
  } else {
    // Fallback for environments without crypto (should not happen in production)
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds a Content Security Policy header string with strict directives
 * @param nonce - The CSP nonce for script/style sources
 * @param customDirectives - Optional custom directives to override defaults
 * @returns Complete CSP header value
 */
export function buildCSPHeader(
  nonce: string,
  customDirectives?: Record<string, string[]>
): string {
  const defaultDirectives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'", 'https://api.rolls-royce.com'],
    'font-src': ["'self'", 'data:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': [],
  };

  // Merge custom directives with defaults
  const directives = { ...defaultDirectives, ...customDirectives };

  return Object.entries(directives)
    .map(([directive, values]) => {
      if (values.length === 0) {
        return directive;
      }
      return `${directive} ${values.join(' ')}`;
    })
    .join('; ');
}

/**
 * Applies security headers to an HTTP response
 * @param response - The ServerResponse object
 * @param nonce - The CSP nonce to use
 * @param customCSPDirectives - Optional custom CSP directives
 */
export function applySecurityHeaders(
  response: ServerResponse,
  nonce: string,
  customCSPDirectives?: Record<string, string[]>
): void {
  const cspHeader = buildCSPHeader(nonce, customCSPDirectives);

  // Content Security Policy
  response.setHeader('Content-Security-Policy', cspHeader);
  
  // Prevent MIME type sniffing
  response.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  response.setHeader('X-Frame-Options', 'DENY');
  
  // XSS Protection (legacy but still useful)
  response.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy (Feature Policy)
  response.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );
  
  // Strict Transport Security (HSTS) - only set in production with HTTPS
  if (process.env.NODE_ENV === 'production') {
    response.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
  
  // Cross-Origin policies
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  
  // Cache control for sensitive pages
  response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');
}

/**
 * Middleware factory for Express/Connect-style frameworks
 * @param customCSPDirectives - Optional custom CSP directives
 * @returns Middleware function
 */
export function securityHeadersMiddleware(
  customCSPDirectives?: Record<string, string[]>
) {
  return (req: any, res: ServerResponse, next: () => void): void => {
    const nonce = generateCSPNonce();
    
    // Attach nonce to request for use in templates
    req.cspNonce = nonce;
    
    // Apply headers
    applySecurityHeaders(res, nonce, customCSPDirectives);
    
    next();
  };
}

/**
 * Vite plugin for injecting CSP nonce into index.html
 * Usage: Add to vite.config.js plugins array
 */
export function viteCSPNoncePlugin() {
  let nonce: string;
  
  return {
    name: 'vite:csp-nonce',
    apply: 'build' as const,
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string) {
        nonce = generateCSPNonce();
        
        // Inject nonce into script tags that need it
        return html
          .replace(
            /<script(\s+[^>]*)?>/g,
            (match, attrs) => {
              // Only add nonce to module scripts or scripts with specific marker
              if (attrs.includes('type="module"') || attrs.includes('data-csp-nonce')) {
                return `<script${attrs} nonce="${nonce}">`;
              }
              return match;
            }
          )
          .replace(
            /<style(\s+[^>]*)?>/g,
            (match, attrs) => {
              if (attrs.includes('data-csp-nonce')) {
                return `<style${attrs} nonce="${nonce}">`;
              }
              return match;
            }
          );
      },
    },
    configureServer(server: any) {
      server.middlewares.use((req: any, res: ServerResponse, next: () => void) => {
        const requestNonce = generateCSPNonce();
        req.cspNonce = requestNonce;
        applySecurityHeaders(res, requestNonce);
        next();
      });
    },
  };
}

export default {
  generateCSPNonce,
  buildCSPHeader,
  applySecurityHeaders,
  securityHeadersMiddleware,
  viteCSPNoncePlugin,
};