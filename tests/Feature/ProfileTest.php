<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name, string $role = 'staff'): User
    {
        return User::query()->create(['name' => $name, 'email' => mb_strtolower(str_replace(' ', '.', $name)).'@k.ru', 'password' => 'secret-pass-123', 'role' => $role, 'is_active' => true]);
    }

    public function test_own_profile_edit_and_rights(): void
    {
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');
        $boss = $this->user('Главный Админ', 'admin');

        $this->actingAs($anna)->patchJson("/api/profiles/{$anna->id}", [
            'name' => 'Анна Сидорова',
            'phone' => '+7 (917) 000-00-01',
            'messengers' => ['telegram' => 'https://t.me/anna_s', 'whatsapp' => '+7 917 000-00-01', 'vk' => ''],
            'about' => 'Люблю порядок',
            'birthday' => '1990-03-15',
            'birthdayYearHidden' => true,
            'status' => ['emoji' => '🌴', 'text' => 'В отпуске', 'until' => now()->addDays(3)->toIso8601String()],
        ])->assertOk()
            ->assertJsonPath('data.name', 'Анна Сидорова')
            ->assertJsonPath('data.messengers.telegram', 'anna_s')
            ->assertJsonPath('data.messengers.whatsapp', '79170000001')
            ->assertJsonPath('data.birthday', '03-15')
            ->assertJsonPath('data.birthdate', null)
            ->assertJsonPath('data.form.birthday', '1990-03-15')
            ->assertJsonPath('data.status.text', 'В отпуске');

        /* Должность — только администратор, чужой профиль — нельзя. */
        $this->patchJson("/api/profiles/{$anna->id}", ['position' => 'Директор'])->assertStatus(422);
        $this->patchJson("/api/profiles/{$boris->id}", ['name' => 'Взлом'])->assertForbidden();
        $this->getJson("/api/profiles/{$boris->id}")->assertOk()->assertJsonPath('data.form', null);

        $this->actingAs($boss)->patchJson("/api/profiles/{$anna->id}", ['position' => 'Бухгалтер', 'department' => 'Финансы'])
            ->assertOk()->assertJsonPath('data.position', 'Бухгалтер');

        /* Истёкший статус не показывается. */
        $anna->forceFill(['status_until' => now()->subMinute()])->save();
        $this->getJson("/api/profiles/{$anna->id}")->assertJsonPath('data.status', null);
    }

    public function test_avatar_sizes_and_cleanup(): void
    {
        Storage::fake('local');
        $anna = $this->user('Анна Иванова');
        $boris = $this->user('Борис Петров');

        $first = $this->actingAs($anna)->post("/api/profiles/{$anna->id}/avatar", ['avatar' => UploadedFile::fake()->image('я.jpg', 900, 600)], ['Accept' => 'application/json'])
            ->assertOk()->json('data.avatar');
        $this->assertMatchesRegularExpression('~^avatars/\d+/[a-z0-9]+$~', $first);
        $this->assertCount(4, Storage::disk('local')->files("avatars/{$anna->id}"));

        $image = $this->actingAs($boris)->get("/api/{$first}/96");
        $image->assertOk();
        $this->assertStringContainsString('immutable', $image->headers->get('Cache-Control'));
        [$w, $h] = getimagesizefromstring($image->streamedContent());
        $this->assertSame([128, 128], [$w, $h]);

        /* В списке сотрудников аватар тоже есть. */
        $this->getJson('/api/messenger/users')->assertJsonPath('data.0.avatar', $first);

        /* Чужой — нельзя, новый заменяет старый, удаление чистит файлы. */
        $this->post("/api/profiles/{$anna->id}/avatar", ['avatar' => UploadedFile::fake()->image('x.png', 100, 100)], ['Accept' => 'application/json'])->assertForbidden();
        usleep(2000);
        $second = $this->actingAs($anna)->post("/api/profiles/{$anna->id}/avatar", ['avatar' => UploadedFile::fake()->image('я2.png', 300, 300)], ['Accept' => 'application/json'])->json('data.avatar');
        $this->assertNotSame($first, $second);
        $this->assertCount(4, Storage::disk('local')->files("avatars/{$anna->id}"));
        $this->get("/api/{$first}/64")->assertNotFound();

        $this->deleteJson("/api/profiles/{$anna->id}/avatar")->assertOk()->assertJsonPath('data.avatar', null);
        $this->assertCount(0, Storage::disk('local')->files("avatars/{$anna->id}"));
    }

    public function test_password_change(): void
    {
        $anna = $this->user('Анна Иванова');
        $this->actingAs($anna)->postJson('/api/profile/password', ['current' => 'неверно', 'password' => 'new-pass-456', 'password_confirmation' => 'new-pass-456'])
            ->assertStatus(422)->assertJsonValidationErrors('current');
        $this->postJson('/api/profile/password', ['current' => 'secret-pass-123', 'password' => 'short', 'password_confirmation' => 'short'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->postJson('/api/profile/password', ['current' => 'secret-pass-123', 'password' => 'new-pass-456', 'password_confirmation' => 'new-pass-456'])
            ->assertNoContent();
        $this->assertTrue(Hash::check('new-pass-456', $anna->fresh()->password));
    }
}
