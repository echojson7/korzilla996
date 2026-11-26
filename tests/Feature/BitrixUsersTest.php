<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\User;
use App\Support\Bitrix\Client;
use App\Support\Bitrix\ImportUsers;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BitrixUsersTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_come_disabled_and_existing_are_linked(): void
    {
        $owner = User::factory()->create(['email' => 'boss@korzilla.ru', 'role' => 'owner', 'position' => null]);
        Http::fake([
            '*/department.get.json' => Http::response(['result' => [
                ['ID' => '1', 'NAME' => 'Корзилла'],
                ['ID' => '3', 'NAME' => 'Отдел продаж', 'PARENT' => '1'],
            ], 'total' => 2]),
            '*/user.get.json' => function ($request) {
                $active = $request->data()['FILTER']['ACTIVE'] ?? 'Y';

                return Http::response(['result' => $active === 'Y' ? [
                    ['ID' => '6', 'NAME' => 'Иван', 'LAST_NAME' => 'Босс', 'EMAIL' => 'Boss@korzilla.ru', 'WORK_POSITION' => 'Директор', 'UF_DEPARTMENT' => [1]],
                    ['ID' => '7', 'NAME' => 'Анна', 'LAST_NAME' => 'Петрова', 'ACTIVE' => true, 'EMAIL' => 'anna@korzilla.ru', 'UF_DEPARTMENT' => [3], 'PERSONAL_BIRTHDAY' => '1990-05-12T00:00:00+03:00'],
                ] : [
                    ['ID' => '9', 'ACTIVE' => false, 'NAME' => 'Пётр', 'LAST_NAME' => 'Ушёл', 'EMAIL' => ''],
                ], 'total' => 1]);
            },
        ]);

        $run = fn () => (new ImportUsers(new Client('https://b24.test/rest/6/x/'), photos: false))->run();
        $report = $run();

        $this->assertSame(2, $report['created']);
        $this->assertSame(1, $report['linked']);
        $owner->refresh();
        $this->assertSame(6, $owner->bitrix_id);
        $this->assertTrue($owner->is_active);
        $this->assertSame('owner', $owner->role);
        $this->assertSame('Директор', $owner->position);

        $anna = User::query()->where('bitrix_id', 7)->first();
        $this->assertFalse($anna->is_active);
        $this->assertSame('Отдел продаж', $anna->department);
        $this->assertSame('1990-05-12', $anna->birthday->toDateString());
        $this->assertSame('b24-9', User::query()->where('bitrix_id', 9)->value('email'));
        $this->assertNotNull(User::query()->where('bitrix_id', 9)->value('fired_at'));
        $this->assertNull($anna->fired_at);
        $this->assertSame(Department::query()->where('bitrix_id', 1)->value('id'), Department::query()->where('bitrix_id', 3)->value('parent_id'));

        $again = $run();
        $this->assertSame(0, $again['created'] + $again['departments']);
        $this->assertSame(3, User::query()->count());
    }
}
