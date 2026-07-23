<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'sale_id',
        'amount',
        'method',
        'timestamp',
        'recorded_by'
    ];

    protected $casts = [
        'amount' => 'integer'
    ];
}
