<?php

declare(strict_types=1);

function send_security_headers(): void
{
    if (headers_sent()) {
        return;
    }

    header_remove('X-Powered-By');
    header('X-Frame-Options: SAMEORIGIN');
    header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self)');
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; form-action " . csp_form_action_sources() . "; base-uri 'self'; frame-ancestors 'self'");
}

function csp_form_action_sources(): string
{
    $sources = ["'self'"];

    try {
        $epayUrl = epay_submit_url((string) setting('epay_api_url', ''));
        $scheme = strtolower((string) parse_url($epayUrl, PHP_URL_SCHEME));
        $host = strtolower((string) parse_url($epayUrl, PHP_URL_HOST));
        $port = parse_url($epayUrl, PHP_URL_PORT);

        if (in_array($scheme, ['https', 'http'], true) && $host !== '') {
            $origin = $scheme . '://' . $host;
            if (is_int($port)) {
                $origin .= ':' . $port;
            }
            $sources[] = $origin;
        }
    } catch (Throwable) {
    }

    return implode(' ', array_values(array_unique($sources)));
}

function start_secure_session(): void
{
    session_name((string) (config()['session_name'] ?? 'tg_video_pay'));
    session_set_cookie_params([
        'httponly' => true,
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'samesite' => 'Lax',
    ]);
    session_start();
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(24));
    }

    return $_SESSION['csrf_token'];
}

function assert_csrf(): void
{
    $token = $_POST['csrf_token'] ?? '';
    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        throw new RuntimeException('CSRF token invalid');
    }
}

function verify_hmac_signature(array $payload, string $secret): bool
{
    $provided = (string) ($payload['sign'] ?? '');
    if ($provided === '' || $secret === '') {
        return false;
    }

    unset($payload['sign']);
    ksort($payload);

    $base = http_build_query($payload, '', '&', PHP_QUERY_RFC3986);
    $expected = hash_hmac('sha256', $base, $secret);

    return hash_equals($expected, $provided);
}
