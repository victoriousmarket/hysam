<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('code');
            $table->string('name');
            $table->string('size');
            $table->string('brand');
            $table->text('description')->nullable();
            $table->string('category');
            $table->integer('unit_price');
            $table->integer('current_stock');
            $table->integer('min_stock_level');
            $table->boolean('archived')->default(false);
            $table->string('user_id')->nullable();
            $table->string('updated_at');
        });

        Schema::create('sales', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_name');
            $table->json('items');
            $table->integer('total_amount');
            $table->integer('paid_amount');
            $table->integer('cash_amount')->default(0);
            $table->integer('pos_amount')->default(0);
            $table->text('note')->nullable();
            $table->string('status'); // 'completed' | 'installment' | 'returned'
            $table->string('delivery_status'); // 'none' | 'pending' | 'delivered'
            $table->string('delivered_at')->nullable();
            $table->string('delivered_by')->nullable();
            $table->text('return_reason')->nullable();
            $table->string('user_id');
            $table->string('created_at');
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('sale_id');
            $table->integer('amount');
            $table->string('method');
            $table->string('timestamp');
            $table->string('recorded_by');
        });

        Schema::create('sales_returns', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('sale_id');
            $table->string('customer_name');
            $table->string('code');
            $table->string('product_id');
            $table->string('product_name');
            $table->integer('quantity');
            $table->integer('refund_amount');
            $table->text('reason');
            $table->string('created_at');
            $table->string('user_id');
        });

        Schema::create('inventory_logs', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('product_id');
            $table->string('type'); // 'stock-in' | 'stock-out'
            $table->integer('quantity');
            $table->string('user_id');
            $table->text('notes')->nullable();
            $table->string('timestamp');
        });

        Schema::create('activities', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('type');
            $table->text('description');
            $table->string('user_id');
            $table->string('user_name');
            $table->string('timestamp');
            $table->json('metadata')->nullable();
        });

        Schema::create('app_settings', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->json('data');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('products');
        Schema::dropIfExists('sales');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('sales_returns');
        Schema::dropIfExists('inventory_logs');
        Schema::dropIfExists('activities');
        Schema::dropIfExists('app_settings');
    }
};
