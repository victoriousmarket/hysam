<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Sale extends Model
{
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'customer_name',
        'items',
        'total_amount',
        'paid_amount',
        'cash_amount',
        'pos_amount',
        'note',
        'status',
        'delivery_status',
        'delivered_at',
        'delivered_by',
        'return_reason',
        'user_id',
        'created_at'
    ];

    protected $casts = [
        'items' => 'array',
        'total_amount' => 'integer',
        'paid_amount' => 'integer',
        'cash_amount' => 'integer',
        'pos_amount' => 'integer'
    ];
}
