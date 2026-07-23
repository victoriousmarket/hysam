<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SalesReturn extends Model
{
    protected $table = 'sales_returns';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'sale_id',
        'customer_name',
        'code',
        'product_id',
        'product_name',
        'quantity',
        'refund_amount',
        'reason',
        'created_at',
        'user_id'
    ];

    protected $casts = [
        'quantity' => 'integer',
        'refund_amount' => 'integer'
    ];
}
