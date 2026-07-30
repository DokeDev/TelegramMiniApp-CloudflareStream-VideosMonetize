<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/helpers.php';
require_once dirname(__DIR__) . '/src/Settings.php';
require_once dirname(__DIR__) . '/src/PaymentGateway.php';

function assert_same(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

assert_same(30000, decimal_to_minor_units('300.00'), 'whole amount');
assert_same(301, decimal_to_minor_units('3.01'), 'fraction amount');
assert_same(300, decimal_to_minor_units('3'), 'amount without fraction');
assert_same(true, strlen(random_order_no()) === 30, 'order number includes 64-bit random suffix');

assert_https_url('测试地址', 'https://pay.example.test', true);
try {
    assert_https_url('测试地址', 'http://pay.example.test', true);
    throw new RuntimeException('http url accepted');
} catch (RuntimeException $exception) {
    assert_same('测试地址必须填写 HTTPS 完整地址', $exception->getMessage(), 'http url rejected');
}

assert_same('请输入 Telegram 用户名', public_error_message(new InvalidArgumentException('请输入 Telegram 用户名')), 'safe public error');
assert_same('支付配置未完成，请联系管理员处理。', public_error_message(new RuntimeException('配置项未填写：epay.key')), 'config public error');

$invalidAmounts = ['1.001', '-1.00', '1e2', 'abc'];
foreach ($invalidAmounts as $amount) {
    try {
        decimal_to_minor_units($amount);
        throw new RuntimeException('invalid amount accepted: ' . $amount);
    } catch (InvalidArgumentException) {
    }
}

$params = ['pid' => '1000', 'money' => '3.00', 'name' => '套餐', 'sign_type' => 'MD5'];
assert_same(md5('money=3.00&name=套餐&pid=1000secret'), epay_sign($params, 'secret'), 'epay signature');
assert_same('alipay', epay_gateway_type_for_method('alipay'), 'alipay gateway type');
assert_same('wxpay', epay_gateway_type_for_method('usdt'), 'usdt maps to keke wxpay gateway type');
assert_same('https://bbs.example.test/source/plugin/keke_pay/submit.php', epay_submit_url('https://bbs.example.test/source/plugin/keke_pay/submit.php'), 'submit url unchanged');
assert_same('https://bbs.example.test/source/plugin/keke_pay/submit.php', epay_submit_url('https://bbs.example.test/source/plugin/keke_pay/'), 'plugin base url normalized');
assert_same('https://bbs.example.test/source/plugin/keke_pay/submit.php', epay_submit_url('https://bbs.example.test'), 'domain url normalized');

settings_cache([
    'base_url' => 'https://pay.example.test',
    'epay_api_url' => 'https://bbs.example.test/source/plugin/keke_pay/submit.php',
    'epay_merchant_pid' => '1000',
    'epay_merchant_key' => 'secret',
    'epay_alipay_enabled' => '1',
    'epay_usdt_enabled' => '1',
]);

$usdtPayload = [
    'pid' => '1000',
    'trade_no' => 'KP202607220001',
    'out_trade_no' => 'HP260722000001',
    'type' => 'wxpay',
    'name' => '320 积分',
    'money' => '300.00',
    'trade_status' => 'TRADE_SUCCESS',
];
$usdtPayload['sign'] = epay_sign($usdtPayload, 'secret');
assert_same(true, verify_epay_signature($usdtPayload, ['payment_method' => 'usdt']), 'keke wxpay callback verifies as usdt');

$usdtOrder = [
    'payment_method' => 'usdt',
    'order_no' => 'HP260722000001',
    'package_title' => '320 积分',
    'pay_amount' => '300.00',
    'telegram_user_id' => '10001',
];
assert_same(true, str_contains(epay_payment_url($usdtOrder), 'type=wxpay'), 'usdt payment url uses wxpay type');
$paymentRequest = epay_payment_request($usdtOrder);
assert_same('https://bbs.example.test/source/plugin/keke_pay/submit.php', $paymentRequest['url'], 'epay post url');
assert_same('wxpay', $paymentRequest['params']['type'], 'epay post params type');
assert_same(true, verify_epay_signature($paymentRequest['params'], ['payment_method' => 'usdt']), 'epay post params signature verifies');
assert_same(['alipay' => '支付宝', 'usdt' => 'USDT'], enabled_payment_methods(), 'enabled payment methods');

settings_cache([
    'base_url' => 'https://pay.example.test',
    'epay_api_url' => 'https://bbs.example.test/source/plugin/keke_pay/submit.php',
    'epay_merchant_pid' => '1000',
    'epay_merchant_key' => 'secret',
    'epay_alipay_enabled' => '1',
    'epay_usdt_enabled' => '0',
]);
assert_same(false, payment_method_enabled('usdt'), 'disabled usdt payment method');

echo "unit tests passed\n";
