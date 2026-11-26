<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSignIn;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/* Сессии в файлах: другие входы выходят по отпечатку пароля, а не удалением строк. */
class SignInTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        return User::query()->create(['name' => 'Анна Иванова', 'email' => 'anna@k.ru', 'password' => 'secret-pass-123', 'role' => 'staff', 'is_active' => true]);
    }

    public function test_session_survives_while_password_is_same(): void
    {
        $anna = $this->user();
        $this->actingAs($anna)->withSession([CheckSignIn::KEY => CheckSignIn::stamp($anna)])
            ->getJson('/api/realtime')->assertOk();
    }

    public function test_other_sessions_leave_after_password_change(): void
    {
        $anna = $this->user();
        $old = CheckSignIn::stamp($anna);
        $anna->forceFill(['password' => 'new-secret-456'])->save();

        $this->actingAs($anna)->withSession([CheckSignIn::KEY => $old])
            ->getJson('/api/realtime')->assertUnauthorized();
        $this->assertGuest();
    }

    public function test_disabled_account_leaves(): void
    {
        $anna = $this->user();
        $anna->forceFill(['is_active' => false])->save();

        $this->actingAs($anna)->getJson('/api/realtime')->assertUnauthorized();
        $this->assertGuest();
    }

    public function test_own_password_change_keeps_current_session(): void
    {
        $anna = $this->user();
        $this->actingAs($anna)->withSession([CheckSignIn::KEY => CheckSignIn::stamp($anna)])
            ->postJson('/api/profile/password', ['current' => 'secret-pass-123', 'password' => 'new-secret-456', 'password_confirmation' => 'new-secret-456'])
            ->assertNoContent();
        $this->getJson('/api/realtime')->assertOk();
    }
}
