<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryLog extends Model
{
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'product_id',
        'type',
        'quantity',
        'user_id',
        'notes',
        'timestamp'
    ];

    protected $casts = [
        'quantity' => 'integer'
    ];
}
