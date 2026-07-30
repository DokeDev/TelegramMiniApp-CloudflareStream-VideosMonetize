<?php

declare(strict_types=1);

$privateBootstrap = __DIR__ . '/_private/src/bootstrap.php';
$rootBootstrap = dirname(__DIR__) . '/src/bootstrap.php';

if (is_file($privateBootstrap)) {
    require_once $privateBootstrap;
    return;
}

require_once $rootBootstrap;
