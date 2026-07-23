<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Activity extends Model
{
    protected $table = 'activities';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'id',
        'type',
        'description',
        'user_id',
        'user_name',
        'timestamp',
        'metadata'
    ];

    protected $casts = [
        'metadata' => 'array'
    ];
}
