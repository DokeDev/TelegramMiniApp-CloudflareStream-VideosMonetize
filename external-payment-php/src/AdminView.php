<?php

declare(strict_types=1);

function admin_nav(string $active): string
{
    $items = [
        'orders' => ['/cpl/', '订单'],
        'site' => ['/cpl/settings-site.php', '站点'],
        'project' => ['/cpl/settings-project.php', '主项目'],
        'epay' => ['/cpl/settings-epay.php', '易支付'],
        'packages' => ['/cpl/settings-packages.php', '套餐'],
        'logs' => ['/cpl/logs.php', '日志'],
        'admin' => ['/cpl/settings-admin.php', '管理员'],
    ];

    $html = '<nav class="admin-nav">';
    foreach ($items as $key => [$url, $label]) {
        $class = $key === $active ? ' class="active"' : '';
        $html .= '<a' . $class . ' href="' . e($url) . '">' . e($label) . '</a>';
    }
    $html .= '<a href="/cpl/logout.php">退出</a></nav>';
    return $html;
}

function admin_page_header(string $title, string $active): string
{
    return '<section class="admin-toolbar"><div><p class="eyebrow">Control Panel</p><h1>'
        . e($title) . '</h1></div></section>' . admin_nav($active);
}
