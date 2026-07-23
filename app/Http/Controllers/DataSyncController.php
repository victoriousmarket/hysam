<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Payment;
use App\Models\InventoryLog;
use App\Models\SalesReturn;
use App\Models\Activity;
use App\Models\AppSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class DataSyncController extends Controller
{
    /**
     * Pull all data from primary Laravel database (SQLite or MySQL)
     */
    public function pull(Request $request)
    {
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
     * Push/upsert data directly into local database (source of truth)
     */
    public function push(Request $request)
    {
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
}
