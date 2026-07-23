<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\AppSetting;
use App\Models\InventoryLog;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SalesReturn;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class DataSyncController extends Controller
{
    /**
     * Dynamic PDO connection helper for external DB synchronization
     */
    private function getPdoConnection(array $config)
    {
        $type = $config['type'] ?? 'mysql';
        $host = $config['host'];
        $port = $config['port'] ?? ($type === 'mysql' ? 3306 : 5432);
        $database = $config['database'];
        $user = $config['user'];
        $password = $config['password'] ?? '';

        $driver = $type === 'postgres' ? 'pgsql' : 'mysql';
        $dsn = "{$driver}:host={$host};port={$port};dbname={$database}";

        $options = [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_TIMEOUT => 5,
        ];

        return new \PDO($dsn, $user, $password, $options);
    }

    /**
     * Pull data from database (prefers custom database if configured in header)
     */
    public function pull(Request $request)
    {
        try {
            $dbConfigHeader = $request->header('x-database-config');
            if ($dbConfigHeader) {
                $config = json_decode(base64_decode($dbConfigHeader), true);
                if ($config && !empty($config['host'])) {
                    return response()->json($this->pullFromExternal($config));
                }
            }

            // Global env DB configuration
            if (env('EXTERNAL_DB_HOST')) {
                $config = [
                    'type' => env('EXTERNAL_DB_TYPE', 'postgres'),
                    'host' => env('EXTERNAL_DB_HOST'),
                    'port' => env('EXTERNAL_DB_PORT'),
                    'user' => env('EXTERNAL_DB_USER'),
                    'password' => env('EXTERNAL_DB_PASSWORD'),
                    'database' => env('EXTERNAL_DB_NAME'),
                ];
                return response()->json($this->pullFromExternal($config));
            }
        } catch (\Exception $e) {
            Log::warning("Fallback to primary storage: " . $e->getMessage());
        }

        // Default: Pull from primary local Laravel database
        $products = Product::all()->map(function ($p) {
            return [
                'id' => $p->id,
                'code' => $p->code,
                'name' => $p->name,
                'size' => $p->size,
                'brand' => $p->brand,
                'description' => $p->description ?? '',
                'category' => $p->category,
                'unitPrice' => $p->unit_price,
                'currentStock' => $p->current_stock,
                'minStockLevel' => $p->min_stock_level,
                'archived' => (bool)$p->archived,
                'userId' => $p->user_id,
                'updatedAt' => $p->updated_at,
            ];
        });

        $sales = Sale::all()->map(function ($s) {
            return [
                'id' => $s->id,
                'customerName' => $s->customer_name,
                'items' => $s->items,
                'totalAmount' => $s->total_amount,
                'paidAmount' => $s->paid_amount,
                'cashAmount' => $s->cash_amount,
                'posAmount' => $s->pos_amount,
                'note' => $s->note ?? '',
                'status' => $s->status,
                'deliveryStatus' => $s->delivery_status,
                'deliveredAt' => $s->delivered_at,
                'deliveredBy' => $s->delivered_by,
                'returnReason' => $s->return_reason,
                'userId' => $s->user_id,
                'createdAt' => $s->created_at,
            ];
        });

        $payments = Payment::all()->map(function ($pay) {
            return [
                'id' => $pay->id,
                'saleId' => $pay->sale_id,
                'amount' => $pay->amount,
                'method' => $pay->method,
                'timestamp' => $pay->timestamp,
                'recordedBy' => $pay->recorded_by,
            ];
        });

        $logs = InventoryLog::all()->map(function ($l) {
            return [
                'id' => $l->id,
                'productId' => $l->product_id,
                'type' => $l->type,
                'quantity' => $l->quantity,
                'userId' => $l->user_id,
                'notes' => $l->notes ?? '',
                'timestamp' => $l->timestamp,
            ];
        });

        $returns = SalesReturn::all()->map(function ($r) {
            return [
                'id' => $r->id,
                'saleId' => $r->sale_id,
                'customerName' => $r->customer_name,
                'code' => $r->code,
                'productId' => $r->product_id,
                'productName' => $r->product_name,
                'quantity' => $r->quantity,
                'refundAmount' => $r->refund_amount,
                'reason' => $r->reason,
                'createdAt' => $r->created_at,
                'userId' => $r->user_id,
            ];
        });

        $activities = Activity::all()->map(function ($a) {
            return [
                'id' => $a->id,
                'type' => $a->type,
                'description' => $a->description,
                'userId' => $a->user_id,
                'userName' => $a->user_name,
                'timestamp' => $a->timestamp,
                'metadata' => $a->metadata,
            ];
        });

        $users = User::all()->map(function ($u) {
            return [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'role' => $u->role,
                'disabled' => (bool)$u->disabled,
                'permissions' => $u->permissions,
                'createdAt' => $u->created_at,
            ];
        });

        $settingsRow = AppSetting::find('global');
        $settings = $settingsRow ? $settingsRow->data : null;

        return response()->json([
            'products' => $products,
            'sales' => $sales,
            'payments' => $payments,
            'logs' => $logs,
            'returns' => $returns,
            'activities' => $activities,
            'users' => $users,
            'settings' => $settings,
        ]);
    }

    /**
     * Push/upsert data into database
     */
    public function push(Request $request)
    {
        try {
            $dbConfigHeader = $request->header('x-database-config');
            if ($dbConfigHeader) {
                $config = json_decode(base64_decode($dbConfigHeader), true);
                if ($config && !empty($config['host'])) {
                    $this->pushToExternal($config, $request->all());
                    return response()->json(['status' => 'ok']);
                }
            }

            // Global env DB configuration
            if (env('EXTERNAL_DB_HOST')) {
                $config = [
                    'type' => env('EXTERNAL_DB_TYPE', 'postgres'),
                    'host' => env('EXTERNAL_DB_HOST'),
                    'port' => env('EXTERNAL_DB_PORT'),
                    'user' => env('EXTERNAL_DB_USER'),
                    'password' => env('EXTERNAL_DB_PASSWORD'),
                    'database' => env('EXTERNAL_DB_NAME'),
                ];
                $this->pushToExternal($config, $request->all());
                return response()->json(['status' => 'ok']);
            }
        } catch (\Exception $e) {
            Log::warning("Fallback to primary storage: " . $e->getMessage());
        }

        // Local storage upserts
        $reqUsers = $request->input('users', []);
        $reqProducts = $request->input('products', []);
        $reqSales = $request->input('sales', []);
        $reqPayments = $request->input('payments', []);
        $reqLogs = $request->input('logs', []);
        $reqReturns = $request->input('returns', []);
        $reqActivities = $request->input('activities', []);
        $reqSettings = $request->input('settings');

        foreach ($reqUsers as $item) {
            User::updateOrCreate(
                ['id' => $item['id']],
                [
                    'name' => $item['name'],
                    'email' => $item['email'],
                    'role' => $item['role'],
                    'disabled' => $item['disabled'] ?? false,
                    'permissions' => $item['permissions'] ?? null,
                    'created_at' => $item['createdAt'] ?? null,
                ]
            );
        }

        foreach ($reqProducts as $item) {
            Product::updateOrCreate(
                ['id' => $item['id']],
                [
                    'code' => $item['code'],
                    'name' => $item['name'],
                    'size' => $item['size'],
                    'brand' => $item['brand'],
                    'description' => $item['description'] ?? '',
                    'category' => $item['category'],
                    'unit_price' => $item['unitPrice'],
                    'current_stock' => $item['currentStock'],
                    'min_stock_level' => $item['minStockLevel'],
                    'archived' => $item['archived'] ?? false,
                    'user_id' => $item['userId'] ?? null,
                    'updated_at' => $item['updatedAt'] ?? null,
                ]
            );
        }

        foreach ($reqSales as $item) {
            Sale::updateOrCreate(
                ['id' => $item['id']],
                [
                    'customer_name' => $item['customerName'],
                    'items' => $item['items'],
                    'total_amount' => $item['totalAmount'],
                    'paid_amount' => $item['paidAmount'],
                    'cash_amount' => $item['cashAmount'] ?? 0,
                    'pos_amount' => $item['posAmount'] ?? 0,
                    'note' => $item['note'] ?? '',
                    'status' => $item['status'],
                    'delivery_status' => $item['deliveryStatus'],
                    'delivered_at' => $item['deliveredAt'] ?? null,
                    'delivered_by' => $item['deliveredBy'] ?? null,
                    'return_reason' => $item['returnReason'] ?? null,
                    'user_id' => $item['userId'],
                    'created_at' => $item['createdAt'],
                ]
            );
        }

        foreach ($reqPayments as $item) {
            Payment::updateOrCreate(
                ['id' => $item['id']],
                [
                    'sale_id' => $item['saleId'],
                    'amount' => $item['amount'],
                    'method' => $item['method'],
                    'timestamp' => $item['timestamp'],
                    'recorded_by' => $item['recordedBy'],
                ]
            );
        }

        foreach ($reqLogs as $item) {
            InventoryLog::updateOrCreate(
                ['id' => $item['id']],
                [
                    'product_id' => $item['productId'],
                    'type' => $item['type'],
                    'quantity' => $item['quantity'],
                    'user_id' => $item['userId'],
                    'notes' => $item['notes'] ?? '',
                    'timestamp' => $item['timestamp'],
                ]
            );
        }

        foreach ($reqReturns as $item) {
            SalesReturn::updateOrCreate(
                ['id' => $item['id']],
                [
                    'sale_id' => $item['saleId'],
                    'customer_name' => $item['customerName'],
                    'code' => $item['code'],
                    'product_id' => $item['productId'],
                    'product_name' => $item['productName'],
                    'quantity' => $item['quantity'],
                    'refund_amount' => $item['refundAmount'],
                    'reason' => $item['reason'],
                    'created_at' => $item['createdAt'],
                    'user_id' => $item['userId'],
                ]
            );
        }

        foreach ($reqActivities as $item) {
            Activity::updateOrCreate(
                ['id' => $item['id']],
                [
                    'type' => $item['type'],
                    'description' => $item['description'],
                    'user_id' => $item['userId'],
                    'user_name' => $item['userName'],
                    'timestamp' => $item['timestamp'],
                    'metadata' => $item['metadata'] ?? null,
                ]
            );
        }

        if ($reqSettings) {
            AppSetting::updateOrCreate(
                ['id' => 'global'],
                ['data' => $reqSettings]
            );
        }

        return response()->json(['status' => 'ok']);
    }

    /**
     * Test connection to dynamic database
     */
    public function testConnection(Request $request)
    {
        try {
            $config = $request->all();
            if (empty($config['host'])) {
                $config = [
                    'type' => env('EXTERNAL_DB_TYPE', 'postgres'),
                    'host' => env('EXTERNAL_DB_HOST'),
                    'port' => env('EXTERNAL_DB_PORT'),
                    'user' => env('EXTERNAL_DB_USER'),
                    'password' => env('EXTERNAL_DB_PASSWORD'),
                    'database' => env('EXTERNAL_DB_NAME'),
                ];
            }

            if (empty($config['host'])) {
                return response()->json(['success' => false, 'error' => 'No database configuration found. Please configure the settings.']);
            }

            $pdo = $this->getPdoConnection($config);
            $pdo->query('SELECT 1');

            return response()->json([
                'success' => true,
                'message' => 'Connection successful!',
                'isGlobal' => !empty(env('EXTERNAL_DB_HOST'))
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()]);
        }
    }

    /**
     * Initialize schema on external database
     */
    public function initSchema(Request $request)
    {
        try {
            $config = $request->input('config', []);
            if (empty($config['host'])) {
                $config = [
                    'type' => env('EXTERNAL_DB_TYPE', 'postgres'),
                    'host' => env('EXTERNAL_DB_HOST'),
                    'port' => env('EXTERNAL_DB_PORT'),
                    'user' => env('EXTERNAL_DB_USER'),
                    'password' => env('EXTERNAL_DB_PASSWORD'),
                    'database' => env('EXTERNAL_DB_NAME'),
                ];
            }

            $pdo = $this->getPdoConnection($config);
            $type = $config['type'] ?? 'mysql';

            if ($type === 'mysql') {
                $pdo->exec("CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR(255) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    role VARCHAR(255) NOT NULL,
                    created_at VARCHAR(255) NOT NULL
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS products (
                    id VARCHAR(255) PRIMARY KEY,
                    code VARCHAR(255) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    size VARCHAR(255) NOT NULL,
                    brand VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL,
                    category VARCHAR(255) NOT NULL,
                    unit_price INT NOT NULL,
                    current_stock INT NOT NULL,
                    min_stock_level INT NOT NULL,
                    updated_at VARCHAR(255) NOT NULL
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS sales (
                    id VARCHAR(255) PRIMARY KEY,
                    customer_name VARCHAR(255) NOT NULL,
                    items TEXT NOT NULL,
                    total_amount INT NOT NULL,
                    paid_amount INT NOT NULL,
                    cash_amount INT NOT NULL,
                    pos_amount INT NOT NULL,
                    note TEXT NOT NULL,
                    status VARCHAR(255) NOT NULL,
                    delivery_status VARCHAR(255) NOT NULL,
                    user_id VARCHAR(255) NOT NULL,
                    created_at VARCHAR(255) NOT NULL
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS payments (
                    id VARCHAR(255) PRIMARY KEY,
                    sale_id VARCHAR(255) NOT NULL,
                    amount INT NOT NULL,
                    method VARCHAR(255) NOT NULL,
                    timestamp VARCHAR(255) NOT NULL,
                    recorded_by VARCHAR(255) NOT NULL
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS sales_returns (
                    id VARCHAR(255) PRIMARY KEY,
                    sale_id VARCHAR(255) NOT NULL,
                    customer_name VARCHAR(255) NOT NULL,
                    code VARCHAR(255) NOT NULL,
                    product_id VARCHAR(255) NOT NULL,
                    product_name VARCHAR(255) NOT NULL,
                    quantity INT NOT NULL,
                    refund_amount INT NOT NULL,
                    reason TEXT NOT NULL,
                    created_at VARCHAR(255) NOT NULL,
                    user_id VARCHAR(255) NOT NULL
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS inventory_logs (
                    id VARCHAR(255) PRIMARY KEY,
                    product_id VARCHAR(255) NOT NULL,
                    type VARCHAR(255) NOT NULL,
                    quantity INT NOT NULL,
                    user_id VARCHAR(255) NOT NULL,
                    notes TEXT NOT NULL,
                    timestamp VARCHAR(255) NOT NULL
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS activities (
                    id VARCHAR(255) PRIMARY KEY,
                    type VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL,
                    user_id VARCHAR(255) NOT NULL,
                    user_name VARCHAR(255) NOT NULL,
                    timestamp VARCHAR(255) NOT NULL,
                    metadata TEXT
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS app_settings (
                    id VARCHAR(255) PRIMARY KEY,
                    data TEXT NOT NULL
                )");
            } else {
                // PostgreSQL
                $pdo->exec("CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    role TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    code TEXT NOT NULL,
                    name TEXT NOT NULL,
                    size TEXT NOT NULL,
                    brand TEXT NOT NULL,
                    description TEXT NOT NULL,
                    category TEXT NOT NULL,
                    unit_price INTEGER NOT NULL,
                    current_stock INTEGER NOT NULL,
                    min_stock_level INTEGER NOT NULL,
                    updated_at TEXT NOT NULL
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS sales (
                    id TEXT PRIMARY KEY,
                    customer_name TEXT NOT NULL,
                    items JSONB NOT NULL,
                    total_amount INTEGER NOT NULL,
                    paid_amount INTEGER NOT NULL,
                    cash_amount INTEGER NOT NULL,
                    pos_amount INTEGER NOT NULL,
                    note TEXT NOT NULL,
                    status TEXT NOT NULL,
                    delivery_status TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS payments (
                    id TEXT PRIMARY KEY,
                    sale_id TEXT NOT NULL,
                    amount INTEGER NOT NULL,
                    method TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    recorded_by TEXT NOT NULL
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS sales_returns (
                    id TEXT PRIMARY KEY,
                    sale_id TEXT NOT NULL,
                    customer_name TEXT NOT NULL,
                    code TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    product_name TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    refund_amount INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    user_id TEXT NOT NULL
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS inventory_logs (
                    id TEXT PRIMARY KEY,
                    product_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    user_id TEXT NOT NULL,
                    notes TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS activities (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    description TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    user_name TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    metadata JSONB
                )");

                $pdo->exec("CREATE TABLE IF NOT EXISTS app_settings (
                    id TEXT PRIMARY KEY,
                    data JSONB NOT NULL
                )");
            }

            return response()->json(['success' => true, 'message' => 'Tables successfully initialized!']);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Push to external database API
     */
    public function pushExternal(Request $request)
    {
        try {
            $config = $request->input('config', []);
            if (empty($config['host'])) {
                $config = [
                    'type' => env('EXTERNAL_DB_TYPE', 'postgres'),
                    'host' => env('EXTERNAL_DB_HOST'),
                    'port' => env('EXTERNAL_DB_PORT'),
                    'user' => env('EXTERNAL_DB_USER'),
                    'password' => env('EXTERNAL_DB_PASSWORD'),
                    'database' => env('EXTERNAL_DB_NAME'),
                ];
            }

            $this->pushToExternal($config, $request->input('data', []));
            return response()->json(['success' => true, 'message' => 'All records pushed successfully!']);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Pull from external database API
     */
    public function pullExternal(Request $request)
    {
        try {
            $config = $request->input('config', []);
            if (empty($config['host'])) {
                $config = [
                    'type' => env('EXTERNAL_DB_TYPE', 'postgres'),
                    'host' => env('EXTERNAL_DB_HOST'),
                    'port' => env('EXTERNAL_DB_PORT'),
                    'user' => env('EXTERNAL_DB_USER'),
                    'password' => env('EXTERNAL_DB_PASSWORD'),
                    'database' => env('EXTERNAL_DB_NAME'),
                ];
            }

            $data = $this->pullFromExternal($config);
            return response()->json(['success' => true, 'data' => $data]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Internal: push data helper
     */
    private function pushToExternal(array $config, array $data)
    {
        $pdo = $this->getPdoConnection($config);
        $type = $config['type'] ?? 'mysql';

        $pdo->beginTransaction();
        try {
            if ($type === 'mysql') {
                // MySQL push
                if (!empty($data['users'])) {
                    $stmt = $pdo->prepare("INSERT INTO users (id, name, email, role, created_at)
                        VALUES (:id, :name, :email, :role, :created_at)
                        ON DUPLICATE KEY UPDATE name = :name2, email = :email2, role = :role2");
                    foreach ($data['users'] as $item) {
                        $stmt->execute([
                            ':id' => $item['id'],
                            ':name' => $item['name'],
                            ':email' => $item['email'],
                            ':role' => $item['role'],
                            ':created_at' => $item['createdAt'] ?? date('c'),
                            ':name2' => $item['name'],
                            ':email2' => $item['email'],
                            ':role2' => $item['role'],
                        ]);
                    }
                }

                if (!empty($data['products'])) {
                    $stmt = $pdo->prepare("INSERT INTO products (id, code, name, size, brand, description, category, unit_price, current_stock, min_stock_level, updated_at)
                        VALUES (:id, :code, :name, :size, :brand, :description, :category, :unit_price, :current_stock, :min_stock_level, :updated_at)
                        ON DUPLICATE KEY UPDATE code = :code2, name = :name2, size = :size2, brand = :brand2, description = :description2, category = :category2, unit_price = :unit_price2, current_stock = :current_stock2, min_stock_level = :min_stock_level2, updated_at = :updated_at2");
                    foreach ($data['products'] as $item) {
                        $stmt->execute([
                            ':id' => $item['id'],
                            ':code' => $item['code'],
                            ':name' => $item['name'],
                            ':size' => $item['size'],
                            ':brand' => $item['brand'],
                            ':description' => $item['description'] ?? '',
                            ':category' => $item['category'],
                            ':unit_price' => $item['unitPrice'],
                            ':current_stock' => $item['currentStock'],
                            ':min_stock_level' => $item['minStockLevel'],
                            ':updated_at' => $item['updatedAt'] ?? date('c'),
                            ':code2' => $item['code'],
                            ':name2' => $item['name'],
                            ':size2' => $item['size'],
                            ':brand2' => $item['brand'],
                            ':description2' => $item['description'] ?? '',
                            ':category2' => $item['category'],
                            ':unit_price2' => $item['unitPrice'],
                            ':current_stock2' => $item['currentStock'],
                            ':min_stock_level2' => $item['minStockLevel'],
                            ':updated_at2' => $item['updatedAt'] ?? date('c'),
                        ]);
                    }
                }

                if (!empty($data['sales'])) {
                    $stmt = $pdo->prepare("INSERT INTO sales (id, customer_name, items, total_amount, paid_amount, cash_amount, pos_amount, note, status, delivery_status, user_id, created_at)
                        VALUES (:id, :customer_name, :items, :total_amount, :paid_amount, :cash_amount, :pos_amount, :note, :status, :delivery_status, :user_id, :created_at)
                        ON DUPLICATE KEY UPDATE customer_name = :customer_name2, items = :items2, total_amount = :total_amount2, paid_amount = :paid_amount2, cash_amount = :cash_amount2, pos_amount = :pos_amount2, note = :note2, status = :status2, delivery_status = :delivery_status2, user_id = :user_id2, created_at = :created_at2");
                    foreach ($data['sales'] as $item) {
                        $itemsStr = is_string($item['items']) ? $item['items'] : json_encode($item['items'] ?? []);
                        $stmt->execute([
                            ':id' => $item['id'],
                            ':customer_name' => $item['customerName'],
                            ':items' => $itemsStr,
                            ':total_amount' => $item['totalAmount'],
                            ':paid_amount' => $item['paidAmount'],
                            ':cash_amount' => $item['cashAmount'] ?? 0,
                            ':pos_amount' => $item['posAmount'] ?? 0,
                            ':note' => $item['note'] ?? '',
                            ':status' => $item['status'],
                            ':delivery_status' => $item['deliveryStatus'],
                            ':user_id' => $item['userId'],
                            ':created_at' => $item['createdAt'],
                            ':customer_name2' => $item['customerName'],
                            ':items2' => $itemsStr,
                            ':total_amount2' => $item['totalAmount'],
                            ':paid_amount2' => $item['paidAmount'],
                            ':cash_amount2' => $item['cashAmount'] ?? 0,
                            ':pos_amount2' => $item['posAmount'] ?? 0,
                            ':note2' => $item['note'] ?? '',
                            ':status2' => $item['status'],
                            ':delivery_status2' => $item['deliveryStatus'],
                            ':user_id2' => $item['userId'],
                            ':created_at2' => $item['createdAt'],
                        ]);
                    }
                }

                if (!empty($data['payments'])) {
                    $stmt = $pdo->prepare("INSERT INTO payments (id, sale_id, amount, method, timestamp, recorded_by)
                        VALUES (:id, :sale_id, :amount, :method, :timestamp, :recorded_by)
                        ON DUPLICATE KEY UPDATE sale_id = :sale_id2, amount = :amount2, method = :method2, timestamp = :timestamp2, recorded_by = :recorded_by2");
                    foreach ($data['payments'] as $item) {
                        $stmt->execute([
                            ':id' => $item['id'],
                            ':sale_id' => $item['saleId'],
                            ':amount' => $item['amount'],
                            ':method' => $item['method'],
                            ':timestamp' => $item['timestamp'],
                            ':recorded_by' => $item['recordedBy'],
                            ':sale_id2' => $item['saleId'],
                            ':amount2' => $item['amount'],
                            ':method2' => $item['method'],
                            ':timestamp2' => $item['timestamp'],
                            ':recorded_by2' => $item['recordedBy'],
                        ]);
                    }
                }

                if (!empty($data['returns'])) {
                    $stmt = $pdo->prepare("INSERT INTO sales_returns (id, sale_id, customer_name, code, product_id, product_name, quantity, refund_amount, reason, created_at, user_id)
                        VALUES (:id, :sale_id, :customer_name, :code, :product_id, :product_name, :quantity, :refund_amount, :reason, :created_at, :user_id)
                        ON DUPLICATE KEY UPDATE sale_id = :sale_id2, customer_name = :customer_name2, code = :code2, product_id = :product_id2, product_name = :product_name2, quantity = :quantity2, refund_amount = :refund_amount2, reason = :reason2, created_at = :created_at2, user_id = :user_id2");
                    foreach ($data['returns'] as $item) {
                        $stmt->execute([
                            ':id' => $item['id'],
                            ':sale_id' => $item['saleId'],
                            ':customer_name' => $item['customerName'],
                            ':code' => $item['code'],
                            ':product_id' => $item['productId'],
                            ':product_name' => $item['productName'],
                            ':quantity' => $item['quantity'],
                            ':refund_amount' => $item['refundAmount'],
                            ':reason' => $item['reason'],
                            ':created_at' => $item['createdAt'],
                            ':user_id' => $item['userId'],
                            ':sale_id2' => $item['saleId'],
                            ':customer_name2' => $item['customerName'],
                            ':code2' => $item['code'],
                            ':product_id2' => $item['productId'],
                            ':product_name2' => $item['productName'],
                            ':quantity2' => $item['quantity'],
                            ':refund_amount2' => $item['refundAmount'],
                            ':reason2' => $item['reason'],
                            ':created_at2' => $item['createdAt'],
                            ':user_id2' => $item['userId'],
                        ]);
                    }
                }

                if (!empty($data['logs'])) {
                    $stmt = $pdo->prepare("INSERT INTO inventory_logs (id, product_id, type, quantity, user_id, notes, timestamp)
                        VALUES (:id, :product_id, :type, :quantity, :user_id, :notes, :timestamp)
                        ON DUPLICATE KEY UPDATE product_id = :product_id2, type = :type2, quantity = :quantity2, user_id = :user_id2, notes = :notes2, timestamp = :timestamp2");
                    foreach ($data['logs'] as $item) {
                        $stmt->execute([
                            ':id' => $item['id'],
                            ':product_id' => $item['productId'],
                            ':type' => $item['type'],
                            ':quantity' => $item['quantity'],
                            ':user_id' => $item['userId'],
                            ':notes' => $item['notes'] ?? '',
                            ':timestamp' => $item['timestamp'],
                            ':product_id2' => $item['productId'],
                            ':type2' => $item['type'],
                            ':quantity2' => $item['quantity'],
                            ':user_id2' => $item['userId'],
                            ':notes2' => $item['notes'] ?? '',
                            ':timestamp2' => $item['timestamp'],
                        ]);
                    }
                }

                if (!empty($data['activities'])) {
                    $stmt = $pdo->prepare("INSERT INTO activities (id, type, description, user_id, user_name, timestamp, metadata)
                        VALUES (:id, :type, :description, :user_id, :user_name, :timestamp, :metadata)
                        ON DUPLICATE KEY UPDATE type = :type2, description = :description2, user_id = :user_id2, user_name = :user_name2, timestamp = :timestamp2, metadata = :metadata2");
                    foreach ($data['activities'] as $item) {
                        $metaStr = isset($item['metadata']) ? (is_string($item['metadata']) ? $item['metadata'] : json_encode($item['metadata'])) : null;
                        $stmt->execute([
                            ':id' => $item['id'],
                            ':type' => $item['type'],
                            ':description' => $item['description'],
                            ':user_id' => $item['userId'],
                            ':user_name' => $item['userName'],
                            ':timestamp' => $item['timestamp'],
                            ':metadata' => $metaStr,
                            ':type2' => $item['type'],
                            ':description2' => $item['description'],
                            ':user_id2' => $item['userId'],
                            ':user_name2' => $item['userName'],
                            ':timestamp2' => $item['timestamp'],
                            ':metadata2' => $metaStr,
                        ]);
                    }
                }

                if (isset($data['settings'])) {
                    $stmt = $pdo->prepare("INSERT INTO app_settings (id, data)
                        VALUES ('global', :data)
                        ON DUPLICATE KEY UPDATE data = :data2");
                    $settingsStr = json_encode($data['settings']);
                    $stmt->execute([
                        ':data' => $settingsStr,
                        ':data2' => $settingsStr,
                    ]);
                }
            } else {
                // PostgreSQL push
                if (!empty($data['users'])) {
                    $stmt = $pdo->prepare("INSERT INTO users (id, name, email, role, created_at)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (id) DO UPDATE SET name = $2, email = $3, role = $4");
                    foreach ($data['users'] as $item) {
                        $stmt->execute([$item['id'], $item['name'], $item['email'], $item['role'], $item['createdAt'] ?? date('c')]);
                    }
                }

                if (!empty($data['products'])) {
                    $stmt = $pdo->prepare("INSERT INTO products (id, code, name, size, brand, description, category, unit_price, current_stock, min_stock_level, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        ON CONFLICT (id) DO UPDATE SET code = $2, name = $3, size = $4, brand = $5, description = $6, category = $7, unit_price = $8, current_stock = $9, min_stock_level = $10, updated_at = $11");
                    foreach ($data['products'] as $item) {
                        $stmt->execute([
                            $item['id'], $item['code'], $item['name'], $item['size'], $item['brand'], $item['description'] ?? '', $item['category'],
                            $item['unitPrice'], $item['currentStock'], $item['minStockLevel'], $item['updatedAt'] ?? date('c')
                        ]);
                    }
                }

                if (!empty($data['sales'])) {
                    $stmt = $pdo->prepare("INSERT INTO sales (id, customer_name, items, total_amount, paid_amount, cash_amount, pos_amount, note, status, delivery_status, user_id, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        ON CONFLICT (id) DO UPDATE SET customer_name = $2, items = $3, total_amount = $4, paid_amount = $5, cash_amount = $6, pos_amount = $7, note = $8, status = $9, delivery_status = $10, user_id = $11, created_at = $12");
                    foreach ($data['sales'] as $item) {
                        $itemsVal = is_string($item['items']) ? json_decode($item['items'], true) : ($item['items'] ?? []);
                        $stmt->execute([
                            $item['id'], $item['customerName'], json_encode($itemsVal), $item['totalAmount'], $item['paidAmount'],
                            $item['cashAmount'] ?? 0, $item['posAmount'] ?? 0, $item['note'] ?? '', $item['status'], $item['deliveryStatus'],
                            $item['userId'], $item['createdAt']
                        ]);
                    }
                }

                if (!empty($data['payments'])) {
                    $stmt = $pdo->prepare("INSERT INTO payments (id, sale_id, amount, method, timestamp, recorded_by)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (id) DO UPDATE SET sale_id = $2, amount = $3, method = $4, timestamp = $5, recorded_by = $6");
                    foreach ($data['payments'] as $item) {
                        $stmt->execute([$item['id'], $item['saleId'], $item['amount'], $item['method'], $item['timestamp'], $item['recordedBy']]);
                    }
                }

                if (!empty($data['returns'])) {
                    $stmt = $pdo->prepare("INSERT INTO sales_returns (id, sale_id, customer_name, code, product_id, product_name, quantity, refund_amount, reason, created_at, user_id)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        ON CONFLICT (id) DO UPDATE SET sale_id = $2, customer_name = $3, code = $4, product_id = $5, product_name = $6, quantity = $7, refund_amount = $8, reason = $9, created_at = $10, user_id = $11");
                    foreach ($data['returns'] as $item) {
                        $stmt->execute([
                            $item['id'], $item['saleId'], $item['customerName'], $item['code'], $item['productId'], $item['productName'],
                            $item['quantity'], $item['refundAmount'], $item['reason'], $item['createdAt'], $item['userId']
                        ]);
                    }
                }

                if (!empty($data['logs'])) {
                    $stmt = $pdo->prepare("INSERT INTO inventory_logs (id, product_id, type, quantity, user_id, notes, timestamp)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        ON CONFLICT (id) DO UPDATE SET product_id = $2, type = $3, quantity = $4, user_id = $5, notes = $6, timestamp = $7");
                    foreach ($data['logs'] as $item) {
                        $stmt->execute([$item['id'], $item['productId'], $item['type'], $item['quantity'], $item['userId'], $item['notes'] ?? '', $item['timestamp']]);
                    }
                }

                if (!empty($data['activities'])) {
                    $stmt = $pdo->prepare("INSERT INTO activities (id, type, description, user_id, user_name, timestamp, metadata)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        ON CONFLICT (id) DO UPDATE SET type = $2, description = $3, user_id = $4, user_name = $5, timestamp = $6, metadata = $7");
                    foreach ($data['activities'] as $item) {
                        $metaVal = is_string($item['metadata']) ? json_decode($item['metadata'], true) : ($item['metadata'] ?? null);
                        $stmt->execute([
                            $item['id'], $item['type'], $item['description'], $item['userId'], $item['userName'],
                            $item['timestamp'], json_encode($metaVal)
                        ]);
                    }
                }

                if (isset($data['settings'])) {
                    $stmt = $pdo->prepare("INSERT INTO app_settings (id, data)
                        VALUES ('global', $1)
                        ON CONFLICT (id) DO UPDATE SET data = $1");
                    $stmt->execute([json_encode($data['settings'])]);
                }
            }

            $pdo->commit();
        } catch (\Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Internal: pull data helper
     */
    private function pullFromExternal(array $config)
    {
        $pdo = $this->getPdoConnection($config);

        $usersRows = $pdo->query("SELECT * FROM users")->fetchAll();
        $productsRows = $pdo->query("SELECT * FROM products")->fetchAll();
        $salesRows = $pdo->query("SELECT * FROM sales")->fetchAll();
        $paymentsRows = $pdo->query("SELECT * FROM payments")->fetchAll();
        $returnsRows = $pdo->query("SELECT * FROM sales_returns")->fetchAll();
        $logsRows = $pdo->query("SELECT * FROM inventory_logs")->fetchAll();
        $activitiesRows = $pdo->query("SELECT * FROM activities")->fetchAll();

        $settingsRows = [];
        try {
            $settingsRows = $pdo->query("SELECT * FROM app_settings")->fetchAll();
        } catch (\Exception $e) {
            // Ignore missing app_settings table
        }

        $mapUsers = function ($rows) {
            return array_map(function ($r) {
                return [
                    'id' => $r['id'],
                    'name' => $r['name'],
                    'email' => $r['email'],
                    'role' => $r['role'],
                    'createdAt' => $r['created_at'] ?? ($r['createdAt'] ?? null),
                ];
            }, $rows);
        };

        $mapProducts = function ($rows) {
            return array_map(function ($r) {
                return [
                    'id' => $r['id'],
                    'code' => $r['code'],
                    'name' => $r['name'],
                    'size' => $r['size'],
                    'brand' => $r['brand'],
                    'description' => $r['description'] ?? '',
                    'category' => $r['category'],
                    'unitPrice' => isset($r['unit_price']) ? (int)$r['unit_price'] : (int)$r['unitPrice'],
                    'currentStock' => isset($r['current_stock']) ? (int)$r['current_stock'] : (int)$r['currentStock'],
                    'minStockLevel' => isset($r['min_stock_level']) ? (int)$r['min_stock_level'] : (int)$r['minStockLevel'],
                    'archived' => isset($r['archived']) ? (bool)$r['archived'] : false,
                    'updatedAt' => $r['updated_at'] ?? ($r['updatedAt'] ?? null),
                ];
            }, $rows);
        };

        $mapSales = function ($rows) {
            return array_map(function ($r) {
                $items = [];
                if (isset($r['items'])) {
                    $items = is_string($r['items']) ? json_decode($r['items'], true) : $r['items'];
                }
                return [
                    'id' => $r['id'],
                    'customerName' => $r['customer_name'] ?? ($r['customerName'] ?? ''),
                    'items' => $items,
                    'totalAmount' => isset($r['total_amount']) ? (int)$r['total_amount'] : (int)$r['totalAmount'],
                    'paidAmount' => isset($r['paid_amount']) ? (int)$r['paid_amount'] : (int)$r['paidAmount'],
                    'cashAmount' => isset($r['cash_amount']) ? (int)$r['cash_amount'] : (int)($r['cashAmount'] ?? 0),
                    'posAmount' => isset($r['pos_amount']) ? (int)$r['pos_amount'] : (int)($r['posAmount'] ?? 0),
                    'note' => $r['note'] ?? '',
                    'status' => $r['status'],
                    'deliveryStatus' => $r['delivery_status'] ?? ($r['deliveryStatus'] ?? 'none'),
                    'deliveredAt' => $r['delivered_at'] ?? ($r['deliveredAt'] ?? null),
                    'deliveredBy' => $r['delivered_by'] ?? ($r['deliveredBy'] ?? null),
                    'returnReason' => $r['return_reason'] ?? ($r['returnReason'] ?? null),
                    'userId' => $r['user_id'] ?? ($r['userId'] ?? ''),
                    'createdAt' => $r['created_at'] ?? ($r['createdAt'] ?? null),
                ];
            }, $rows);
        };

        $mapPayments = function ($rows) {
            return array_map(function ($r) {
                return [
                    'id' => $r['id'],
                    'saleId' => $r['sale_id'] ?? ($r['saleId'] ?? ''),
                    'amount' => (int)$r['amount'],
                    'method' => $r['method'],
                    'timestamp' => $r['timestamp'],
                    'recordedBy' => $r['recorded_by'] ?? ($r['recordedBy'] ?? ''),
                ];
            }, $rows);
        };

        $mapReturns = function ($rows) {
            return array_map(function ($r) {
                return [
                    'id' => $r['id'],
                    'saleId' => $r['sale_id'] ?? ($r['saleId'] ?? ''),
                    'customerName' => $r['customer_name'] ?? ($r['customerName'] ?? ''),
                    'code' => $r['code'],
                    'productId' => $r['product_id'] ?? ($r['productId'] ?? ''),
                    'productName' => $r['product_name'] ?? ($r['productName'] ?? ''),
                    'quantity' => (int)$r['quantity'],
                    'refundAmount' => isset($r['refund_amount']) ? (int)$r['refund_amount'] : (int)$r['refundAmount'],
                    'reason' => $r['reason'],
                    'createdAt' => $r['created_at'] ?? ($r['createdAt'] ?? ''),
                    'userId' => $r['user_id'] ?? ($r['userId'] ?? ''),
                ];
            }, $rows);
        };

        $mapLogs = function ($rows) {
            return array_map(function ($r) {
                return [
                    'id' => $r['id'],
                    'productId' => $r['product_id'] ?? ($r['productId'] ?? ''),
                    'type' => $r['type'],
                    'quantity' => (int)$r['quantity'],
                    'userId' => $r['user_id'] ?? ($r['userId'] ?? ''),
                    'notes' => $r['notes'] ?? '',
                    'timestamp' => $r['timestamp'],
                ];
            }, $rows);
        };

        $mapActivities = function ($rows) {
            return array_map(function ($r) {
                $metadata = null;
                if (isset($r['metadata'])) {
                    $metadata = is_string($r['metadata']) ? json_decode($r['metadata'], true) : $r['metadata'];
                }
                return [
                    'id' => $r['id'],
                    'type' => $r['type'],
                    'description' => $r['description'],
                    'userId' => $r['user_id'] ?? ($r['userId'] ?? ''),
                    'userName' => $r['user_name'] ?? ($r['userName'] ?? ''),
                    'timestamp' => $r['timestamp'],
                    'metadata' => $metadata,
                ];
            }, $rows);
        };

        $settings = null;
        if (count($settingsRows) > 0) {
            $row = $settingsRows[0];
            foreach ($settingsRows as $r) {
                if ($r['id'] === 'global') {
                    $row = $r;
                    break;
                }
            }
            $settings = is_string($row['data']) ? json_decode($row['data'], true) : $row['data'];
        }

        return [
            'users' => $mapUsers($usersRows),
            'products' => $mapProducts($productsRows),
            'sales' => $mapSales($salesRows),
            'payments' => $mapPayments($paymentsRows),
            'returns' => $mapReturns($returnsRows),
            'logs' => $mapLogs($logsRows),
            'activities' => $mapActivities($activitiesRows),
            'settings' => $settings,
        ];
    }
}
