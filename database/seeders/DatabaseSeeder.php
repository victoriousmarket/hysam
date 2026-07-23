<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Product;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // 1. Seed Admin User with secure hashed password
        User::updateOrCreate(
            ['id' => 'admin-user-1'],
            [
                'name' => 'Admin User',
                'email' => 'admin@hysam.com',
                'password' => Hash::make('password123'),
                'role' => 'admin',
                'disabled' => false,
                'permissions' => [
                    'create' => true,
                    'edit' => true,
                    'delete' => true,
                    'stockIn' => true,
                    'stockOut' => true
                ],
                'created_at' => date('c'),
            ]
        );

        // 2. Seed Staff User with secure hashed password
        User::updateOrCreate(
            ['id' => 'staff-user-1'],
            [
                'name' => 'Staff User',
                'email' => 'staff@hysam.com',
                'password' => Hash::make('password123'),
                'role' => 'staff',
                'disabled' => false,
                'permissions' => [
                    'create' => true,
                    'edit' => false,
                    'delete' => false,
                    'stockIn' => true,
                    'stockOut' => false
                ],
                'created_at' => date('c'),
            ]
        );

        // 3. Seed some initial products so the dashboard looks alive
        Product::updateOrCreate(
            ['id' => 'p1'],
            [
                'code' => 'GEN-001',
                'name' => 'Industrial Generator',
                'size' => '500kVA',
                'brand' => 'Cummins',
                'description' => 'High capacity power backup generator',
                'category' => 'Power',
                'unit_price' => 250000,
                'current_stock' => 10,
                'min_stock_level' => 2,
                'archived' => false,
                'user_id' => 'admin-user-1',
                'updated_at' => date('c'),
            ]
        );

        Product::updateOrCreate(
            ['id' => 'p2'],
            [
                'code' => 'SOL-400',
                'name' => 'Solar Panel',
                'size' => '400W',
                'brand' => 'Jinko',
                'description' => 'Monocrystalline high-efficiency solar panel',
                'category' => 'Solar',
                'unit_price' => 45000,
                'current_stock' => 50,
                'min_stock_level' => 10,
                'archived' => false,
                'user_id' => 'admin-user-1',
                'updated_at' => date('c'),
            ]
        );
    }
}
