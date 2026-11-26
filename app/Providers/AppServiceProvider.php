<?php

namespace App\Providers;

use App\Models\User;
use App\Support\Access;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        /* APCu у консоли свой и обычно выключен (apc.enable_cli=0): artisan
           и планировщик (withoutOverlapping держит блокировку в кэше)
           работают с файловым кэшем. */
        if ($this->app->runningInConsole() && config('cache.default') === 'apc') {
            config(['cache.default' => 'file']);
        }
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        /* Права по разделам (App\Support\Access); задачи — App\Policies\TaskPolicy. */
        Gate::define('manage-access', fn (User $user) => $user->is_active && Access::isManager($user));
        Gate::define('access', fn (User $user, string $section, string $action, string $at = 'own') => Access::allows($user, $section, $action, $at));
    }
}
