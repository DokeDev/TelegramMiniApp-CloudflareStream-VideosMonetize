<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/_boot.php';

json_response([
    'ok' => false,
    'error' => 'generic callback is disabled',
], 404);
