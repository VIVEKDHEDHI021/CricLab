<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$eventTypes = DB::table('ball_events')->select('event_type', DB::raw('count(*) as total'))->groupBy('event_type')->get();
foreach ($eventTypes as $et) {
    echo "Event Type: {$et->event_type} | Count: {$et->total}\n";
}
