<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    /**
     * Authenticate user and start session
     */
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', trim(strtolower($request->email)))->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json([
                'error' => 'Incorrect email address or password. Please verify your credentials.'
            ], 401);
        }

        if ($user->disabled) {
            return response()->json([
                'error' => 'Your account has been disabled by the administrator. Please contact support.'
            ], 403);
        }

        // Authenticate the user session
        Auth::login($user, true); // Keep user logged in using remember cookie if desired, or true

        // Regenerate session to protect against session fixation attacks
        $request->session()->regenerate();

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'disabled' => (bool)$user->disabled,
            'permissions' => $user->permissions,
            'createdAt' => $user->created_at,
        ]);
    }

    /**
     * Destroy user session
     */
    public function logout(Request $request)
    {
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['status' => 'logged_out']);
    }

    /**
     * Get currently authenticated user details
     */
    public function me(Request $request)
    {
        if (Auth::check()) {
            $user = Auth::user();
            return response()->json([
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'disabled' => (bool)$user->disabled,
                'permissions' => $user->permissions,
                'createdAt' => $user->created_at,
            ]);
        }

        return response()->json(['error' => 'Unauthenticated.'], 401);
    }
}
