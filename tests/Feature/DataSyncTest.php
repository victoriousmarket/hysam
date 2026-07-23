<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DataSyncTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test catch-all web route resolves to app layout view
     */
    public function test_web_fallback_route_resolves_successfully(): void
    {
        $response = $this->get('/dashboard');
        $response->assertStatus(200);
        $response->assertSee('Hysam Ventures Business Suite');
    }

    /**
     * Test API endpoints are protected and return 401 for guests
     */
    public function test_api_endpoints_return_401_for_unauthenticated_guests(): void
    {
        // Should return 401 Unauthenticated for GET /api/data
        $response = $this->getJson('/api/data');
        $response->assertStatus(401);

        // Should return 401 Unauthenticated for POST /api/data
        $response = $this->postJson('/api/data', []);
        $response->assertStatus(401);
    }

    /**
     * Test secure login with correct credentials
     */
    public function test_login_authenticates_and_starts_session_successfully(): void
    {
        // Seed user with hashed password
        User::create([
            'id' => 'user-1',
            'name' => 'John Doe',
            'email' => 'john@hysam.com',
            'password' => Hash::make('secret123'),
            'role' => 'admin',
            'disabled' => false,
            'permissions' => ['create' => true],
            'created_at' => date('c'),
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'john@hysam.com',
            'password' => 'secret123'
        ]);

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'id', 'name', 'email', 'role', 'disabled', 'permissions', 'createdAt'
        ]);
        $response->assertJson([
            'email' => 'john@hysam.com',
            'role' => 'admin'
        ]);

        // Verify the user is authenticated in the session
        $this->assertAuthenticated();
    }

    /**
     * Test login with incorrect credentials fails
     */
    public function test_login_fails_with_invalid_credentials(): void
    {
        User::create([
            'id' => 'user-1',
            'name' => 'John Doe',
            'email' => 'john@hysam.com',
            'password' => Hash::make('secret123'),
            'role' => 'admin',
            'disabled' => false,
            'permissions' => ['create' => true],
            'created_at' => date('c'),
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'john@hysam.com',
            'password' => 'wrongpassword'
        ]);

        $response->assertStatus(401);
        $response->assertJsonStructure(['error']);
    }

    /**
     * Test login fails for disabled users
     */
    public function test_login_fails_for_disabled_accounts(): void
    {
        User::create([
            'id' => 'user-1',
            'name' => 'Disabled User',
            'email' => 'disabled@hysam.com',
            'password' => Hash::make('secret123'),
            'role' => 'sales',
            'disabled' => true,
            'permissions' => ['create' => true],
            'created_at' => date('c'),
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'disabled@hysam.com',
            'password' => 'secret123'
        ]);

        $response->assertStatus(403);
        $response->assertJsonStructure(['error']);
    }

    /**
     * Test session profile endpoint returns active user
     */
    public function test_me_endpoint_returns_currently_authenticated_user(): void
    {
        $user = User::create([
            'id' => 'user-1',
            'name' => 'John Doe',
            'email' => 'john@hysam.com',
            'password' => Hash::make('secret123'),
            'role' => 'admin',
            'disabled' => false,
            'permissions' => ['create' => true],
            'created_at' => date('c'),
        ]);

        // Unauthenticated request
        $response = $this->getJson('/api/me');
        $response->assertStatus(401);

        // Authenticated request
        $response = $this->actingAs($user)->getJson('/api/me');
        $response->assertStatus(200);
        $response->assertJson([
            'email' => 'john@hysam.com'
        ]);
    }

    /**
     * Test logout destroys session
     */
    public function test_logout_destroys_user_session(): void
    {
        $user = User::create([
            'id' => 'user-1',
            'name' => 'John Doe',
            'email' => 'john@hysam.com',
            'password' => Hash::make('secret123'),
            'role' => 'admin',
            'disabled' => false,
            'permissions' => ['create' => true],
            'created_at' => date('c'),
        ]);

        $response = $this->actingAs($user)->postJson('/api/logout');
        $response->assertStatus(200);
        $response->assertJson(['status' => 'logged_out']);

        // Assert user is guest in session
        $this->assertGuest();
    }

    /**
     * Test data pull works when authenticated
     */
    public function test_api_pulls_data_when_authenticated(): void
    {
        $user = User::create([
            'id' => 'user-1',
            'name' => 'John Doe',
            'email' => 'john@hysam.com',
            'password' => Hash::make('secret123'),
            'role' => 'admin',
            'disabled' => false,
            'permissions' => ['create' => true],
            'created_at' => date('c'),
        ]);

        Product::create([
            'id' => 'prod-1',
            'code' => 'GEN-999',
            'name' => 'Test Generator',
            'size' => '100kVA',
            'brand' => 'Perkins',
            'description' => 'Test generator desc',
            'category' => 'Power',
            'unit_price' => 150000,
            'current_stock' => 5,
            'min_stock_level' => 1,
            'archived' => false,
            'updated_at' => date('c'),
        ]);

        $response = $this->actingAs($user)->getJson('/api/data');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'products', 'sales', 'payments', 'logs', 'returns', 'activities', 'users', 'settings'
        ]);
    }

    /**
     * Test data push works when authenticated
     */
    public function test_api_pushes_data_when_authenticated(): void
    {
        $user = User::create([
            'id' => 'user-1',
            'name' => 'John Doe',
            'email' => 'john@hysam.com',
            'password' => Hash::make('secret123'),
            'role' => 'admin',
            'disabled' => false,
            'permissions' => ['create' => true],
            'created_at' => date('c'),
        ]);

        $payload = [
            'products' => [
                [
                    'id' => 'prod-pushed',
                    'code' => 'SOL-999',
                    'name' => 'Pushed Solar Panel',
                    'size' => '500W',
                    'brand' => 'Trina',
                    'description' => 'Pushed solar panel desc',
                    'category' => 'Solar',
                    'unitPrice' => 60000,
                    'currentStock' => 20,
                    'minStockLevel' => 5,
                    'archived' => false,
                    'updatedAt' => date('c')
                ]
            ]
        ];

        $response = $this->actingAs($user)->postJson('/api/data', $payload);

        $response->assertStatus(200);
        $response->assertJson(['status' => 'ok']);

        // Verify product was created
        $this->assertDatabaseHas('products', [
            'id' => 'prod-pushed',
            'code' => 'SOL-999'
        ]);
    }
}
