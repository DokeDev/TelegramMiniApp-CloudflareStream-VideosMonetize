<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/_boot.php';

admin_logout();
redirect_to('/cpl/login.php');

