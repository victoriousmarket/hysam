<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'code',
        'name',
        'size',
        'brand',
        'description',
        'category',
        'unit_price',
        'current_stock',
        'min_stock_level',
        'archived',
        'user_id',
        'updated_at'
    ];

    protected $casts = [
        'unit_price' => 'integer',
        'current_stock' => 'integer',
        'min_stock_level' => 'integer',
        'archived' => 'boolean'
    ];
}
